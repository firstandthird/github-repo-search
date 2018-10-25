const browser = window.browser || window.chrome;

/**
 * Default config
 */
const CONSTANTS = {
  TOKEN_NAME: 'ogh_personal_token',
  ARCHIVED_REPOS: 'archived'
};

const CONTEXT_MENU = {
  id: 'ogh-sync-option',
  syncDisabled: {
    title: 'Synchronizing repositories...',
    enabled: false,
    onclick: null
  },
  syncRepos: {
    title: 'Synchronize repositories',
    enabled: true,
    onclick: () => syncRepos(true)
  },
  addToken: {
    title: 'Please provide a valid token',
    enabled: true,
    onclick: openOptionsPage
  }
};

const NOTIFICATIONS = {
  installed: {
    id: 'oghInstalled',
    content: {
      contextMessage: 'Successful installation',
      message: 'Open extension options and add a token to get started'
    }
  },
  syncSuccess: {
    content: {
      contextMessage: 'Synchronization finished!',
      message: 'Your GitHub repositories have been synchronized'
    }
  },
  tokenError: {
    id: 'oghTokenError',
    content: {
      contextMessage: 'Invalid token',
      message: 'Please provide a valid token in the options page'
    }
  },
  syncError: {
    content: {
      contextMessage: 'Invalid token',
      message: 'Error syncing your repositories'
    }
  }
};

const MAX_SUGGESTIONS = 10;

const RESULTS_PER_PAGE = 100;

const FETCH_PARAMS = {
  method: 'GET',
  mode: 'cors',
  cache: 'default'
};

const apiUrl = new URL('https://api.github.com/user/repos');
apiUrl.searchParams.set('per_page', RESULTS_PER_PAGE);

/**
 * Default options
 */
let showArchivedRepos = false;

/**
 * Indicates whether a request is still on course or not
 */
let isFetching = false;

/**
 * Used to store temp cached suggestions
 */
let suggestionsCache = [];

/**
 * Sets token to request
 *
 * @param {string} [token='']
 * @returns
 */
function setToken(token = '') {
  apiUrl.searchParams.set('access_token', token);
}

/**
 * Filters a GitHub API response to match browser suggestions object
 *
 * @param {object} data
 * @returns
 */
function formatAsSuggestion(data) {
  return {
    content: data.html_url,
    description: `${data.full_name} -`
  };
}

/**
 * Highlights matched text
 *
 * @param {string} text Text to match
 * @param {array} results Data to match text against
 * @returns
 */
function highlightResults(text, results) {
  try {
    const searchTextRegExp = new RegExp(text, 'i');

    return results
      .filter(suggestion => searchTextRegExp.test(suggestion.description))
      .slice(0, MAX_SUGGESTIONS)
      .map(res => {
        const match = res.description.replace(searchTextRegExp, '<match>$&</match>');

        return {
          content: res.content,
          description: `<dim>${match}</dim> <url>${res.content}</url>`
        };
      });
  } catch (error) {
    return [];
  }
}

/**
 * Enables manual sync button
 */
function enableSyncButton() {
  browser.contextMenus.update(CONTEXT_MENU.id, CONTEXT_MENU.syncRepos);
}

/**
 * Disables manual sync button
 */
function disableSyncButton() {
  browser.contextMenus.update(CONTEXT_MENU.id, CONTEXT_MENU.syncDisabled);
}

/**
 * Disables manual sync button
 */
function setInvalidTokenButton() {
  browser.contextMenus.update(CONTEXT_MENU.id, CONTEXT_MENU.addToken);
}

/**
 * Creates a notification with the specified params
 *
 * @param {Object} notification - Notification object
 * @param {string} [notification.id] - Notification ID
 * @param {Object} [notification.content={}] - Notification options (title, message...)
 */
function createNotification({ id, content = {} }) {
  const notification = Object.assign({
    iconUrl: '../../icons/icon48.png',
    title: 'Github Repo Search',
    type: 'basic'
  }, content);

  if (id) {
    browser.notifications.clear(id);
  }

  browser.notifications.create(id, notification);
}

/**
 * Fetches GitHub user repos
 *
 * @async
 * @returns {Promise<Array>}
 */
async function search() {
  if (isFetching) {
    return [];
  }

  isFetching = true;

  const getRepos = async (page = 1, items = []) => {
    try {
      apiUrl.searchParams.set('page', page);

      const response = await fetch(apiUrl, FETCH_PARAMS);
      let data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setInvalidTokenButton();
          createNotification(NOTIFICATIONS.tokenError);
        } else {
          enableSyncButton();
          createNotification(NOTIFICATIONS.syncError);
        }

        throw ('Error fetching repos');
      }

      const totalResults = data.length;

      if (!showArchivedRepos) {
        data = data.filter(repo => !repo.archived);
      }

      items = items.concat(data.map(formatAsSuggestion));

      if (!totalResults || totalResults < RESULTS_PER_PAGE) {
        isFetching = false;
        return items;
      }

      return await getRepos(page + 1, items);
    }
    catch (error) {
      isFetching = false;
      throw error;
    }
  };

  return getRepos();
}

/**
 * Adds context menu buttons
 */
function addContextButtons() {
  browser.contextMenus.create({
    id: CONTEXT_MENU.id,
    contexts: ['page_action'],
    type: 'normal',
    title: 'Synchronize repositories',
    visible: true
  }, () => { });
}

/**
 * Handles browser storage changes
 *
 * @param {Object} changes
 * @param {string} areaName
 */
function onBrowserStorageChanged(changes, areaName) {
  if (areaName === 'sync') {
    if (changes[CONSTANTS.TOKEN_NAME]) {
      setToken(changes[CONSTANTS.TOKEN_NAME].newValue || changes[CONSTANTS.TOKEN_NAME]);
      enableSyncButton();
    }

    if (changes[CONSTANTS.ARCHIVED_REPOS]) {
      showArchivedRepos = changes[CONSTANTS.ARCHIVED_REPOS].newValue;
    }

    syncRepos(true);
  }
}

/**
 * Fired on every input change
 *
 * @param {string} text User entered text
 * @param {function} suggest Opens the suggestions box
 */
function onInputChangedHandler(text, suggest) {
  getSuggestionsCache(suggestionsCache => {
    const suggestions = highlightResults(text, suggestionsCache);

    if (suggestions.length) {
      browser.omnibox.setDefaultSuggestion({ description: suggestions[0].description });
      suggestions.shift();
    } else {
      browser.omnibox.setDefaultSuggestion({ description: `No repositories found matching <match>${ text }</match>` });
    }

    suggest(suggestions);
  });
}

/**
 * Returns the suggested repos cache if exists, otherwise syncs and returns repos
 *
 * @param {function} [callback] Callback function with cached repos array
 */
function getSuggestionsCache(callback = () => {}) {
  if (suggestionsCache && suggestionsCache.length) {
    return callback(suggestionsCache);
  }

  syncLocalRepos(repos => callback(repos));
}

/**
 * Navigates to the given URL or filters cached results if not url provided
 *
 * @param {string} userInput Text entered by the user
 */
function onInputEnteredHandler(userInput) {
  let url;

  try {
    url = new URL(userInput).href;
  }
  catch (error) {
    getSuggestionsCache(suggestionsCache => {
      const suggestions = highlightResults(userInput, suggestionsCache);

      if (suggestions.length) {
        url = suggestions[0].content;
      }
    });
  }

  if (url) {
    browser.tabs.query({ active: true, currentWindow: true }, tabs => {
      browser.tabs.update(tabs[0].id, { url });
    });
  }
}

/**
 * Synchronizes local stored repositories
 *
 * @async
 * @param {function} [callback]
 */
async function syncLocalRepos(callback = () => {}) {
  browser.storage.local.get({
    'repos': []
  }, data => {
    suggestionsCache = data.repos;
    callback(data.repos);
  });
}

/**
 * Fetches repos from GitHub and savem them into local storage
 *
 * @async
 * @param {boolean} [notify=false] If active, shows a success notification
 * @param {function} [callback]
 */
async function syncRepos(notify = false, callback = () => {}) {
  disableSyncButton();

  search()
    .then(suggestionsCache => {
      browser.storage.local.set({ repos: suggestionsCache }, () => {
        if (notify) {
          createNotification(NOTIFICATIONS.syncSuccess);
        }

        enableSyncButton();
        callback(suggestionsCache);
      });
    })
    .catch(error => {});
}

/**
 * Run after extension is installed
 */
function onExtensionInstall() {
  getConfig(config => {
    if (!config[CONSTANTS.TOKEN_NAME]) {
      setInvalidTokenButton();
      createNotification(NOTIFICATIONS.installed);
    }
  });
}

/**
 * Opens extension options page
 */
function openOptionsPage() {
  if (browser.runtime.openOptionsPage) {
    browser.runtime.openOptionsPage();
  } else {
    window.open(browser.runtime.getURL('src/options/options.html'));
  }
}

/**
 * Notification click handler
 *
 * @param {string} notificationId
 */
function onNotificationClicked(notificationId) {
  if (notificationId === NOTIFICATIONS.installed.id || notificationId === NOTIFICATIONS.tokenError.id) {
    openOptionsPage();
  }
};

/**
 * Register event listeners
 */
function registerListeners() {
  browser.storage.onChanged.addListener(onBrowserStorageChanged);
  browser.omnibox.onInputChanged.addListener(onInputChangedHandler);
  browser.omnibox.onInputEntered.addListener(onInputEnteredHandler);
  browser.omnibox.onInputStarted.addListener(syncLocalRepos);
  browser.runtime.onInstalled.addListener(onExtensionInstall);
  browser.notifications.onClicked.addListener(onNotificationClicked);
}

/**
 * Returns extension saved config
 *
 * @param {function} [callback] Callback function
 */
function getConfig(callback = () => {}) {
  browser.storage.sync.get({
    [CONSTANTS.TOKEN_NAME]: '',
    [CONSTANTS.ARCHIVED_REPOS]: false
  }, config => callback(config));
}

/**
 * Called on plugin load
 */
function init() {
  addContextButtons();
  registerListeners();

  getConfig(config => {
    try {
      showArchivedRepos = config[CONSTANTS.ARCHIVED_REPOS];

      if (config[CONSTANTS.TOKEN_NAME]) {
        setToken(config[CONSTANTS.TOKEN_NAME]);
        syncLocalRepos(data => syncRepos());
      } else {
        disableSyncButton();
      }
    } catch (error) {
      console.log(error);
    }
  });
}

init();
