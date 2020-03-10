const browser = window.browser || window.chrome;
const isDarkMode = matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Default config
 */
const CONSTANTS = {
  TOKEN_NAME: 'ogh_personal_token',
  ARCHIVED_REPOS: 'archived',
  AUTOSYNC_REPOS: 'autosync'
};

const isFirefox = typeof InstallTrigger !== 'undefined';
const isChrome = !isFirefox;

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

const RESULTS_PER_PAGE = '100';

const FETCH_PARAMS = {
  method: 'GET',
  mode: 'cors',
  cache: 'default',
  headers: {
    Authorization: ''
  }
};

const apiUrl = new URL('https://api.github.com/user/repos');
apiUrl.searchParams.set('per_page', RESULTS_PER_PAGE);

/**
 * Default options
 */
let showArchivedRepos = false;

/**
 * Sync repos automatically (default every 30 minutes)
 */
let autoSyncRepos = 30;

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
  FETCH_PARAMS.headers.Authorization = `token ${token}`;
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
 * Checks matches trying to use repo name.
 * @param {string} description
 * @param {RegExp} text
 * @param {boolean} onlyRepo
 * @returns {boolean}
 */
function isMatch(description, text, onlyRepo) {
  const matchText = onlyRepo ? description.split('/').pop() : description;
  return text.test(matchText);
}

/**
 * Function that exposes current status
 * @returns {{isFetching: boolean, token: string}}
 */
function getStatus() { // eslint-disable-line no-unused-vars
  return {
    isFetching,
    token: FETCH_PARAMS.headers.Authorization
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
    const highlights = [];
    const added = {};
    const length = results.length;

    // Only searching on repo name first
    for (let i = 0; i < length; i++) {
      const repo = results[i];

      if (isMatch(repo.description, searchTextRegExp, true)) {
        highlights.push(repo);
        added[repo.description] = true;

        if (highlights.length === MAX_SUGGESTIONS) {
          break;
        }
      }
    }

    // If not enough suggestions, try the org/user too
    for (let i = 0; i < length; i++) {
      const repo = results[i];

      if (!added[repo.description] && isMatch(repo.description, searchTextRegExp, false)) {
        highlights.push(repo);

        if (highlights.length === MAX_SUGGESTIONS) {
          break;
        }
      }
    }

    return highlights
      .map(res => {
        let match = res.description;
        let description = match;

        if (isChrome) {
          match = match.replace(searchTextRegExp, '<match>$&</match>');
          description = `<dim>${match}</dim> <url>${res.content}</url>`;
        }

        return {
          content: res.content,
          description
        };
      });
  } catch (error) {
    return [];
  }
}

/**
 * Creates a notification with the specified params
 *
 * @param {Object} notification - Notification object
 * @param {string} [notification.id] - Notification ID
 * @param {Object} [notification.content={}] - Notification options (title, message...)
 */
function createNotification({ id, content = {} }) {
  const icon = isDarkMode ? 'icon48_light.png' : 'icon48.png';
  const notification = Object.assign({
    iconUrl: `../../icons/${icon}`,
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
 * @returns {Promise<Array>}
 */
function search() {
  if (isFetching) {
    return Promise.resolve([]);
  }

  isFetching = true;

  const getRepos = async (page = 1, items = []) => {
    try {
      apiUrl.searchParams.set('page', page.toString());

      const response = await fetch(apiUrl, FETCH_PARAMS);
      let data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          createNotification(NOTIFICATIONS.tokenError);
        } else {
          createNotification(NOTIFICATIONS.syncError);
        }

        throw new Error('Error fetching repos');
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
    } catch (error) {
      isFetching = false;
      throw error;
    }
  };

  return getRepos();
}

/**
 * Fetches repos from GitHub and savem them into local storage
 *
 * @param {boolean} [notify=false] If active, shows a success notification
 * @param {function} [callback]
 */
function syncRepos(notify = false, callback = () => { }) {
  search()
    .then(repos => {
      browser.storage.local.set({ repos }, () => {
        if (notify) {
          createNotification(NOTIFICATIONS.syncSuccess);
        }

        callback(repos);
      });
    })
    .catch(() => { });
}

/**
 * Cancels a scheduled alarm
 *
 * @param {string} [name=null] Alarm name
 */
function cancelAlarm(name = null) {
  browser.alarms.clear(name);
}

/**
 * Schedule a periodic alarm
 *
 * @param {string} [name=null] Alarm name
 * @param {number} [time=30] Alarm period
 */
function createAlarm(name = null, time = 30) {
  browser.alarms.create(name, {
    periodInMinutes: parseInt(time, 10)
  });
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
    }

    if (changes[CONSTANTS.ARCHIVED_REPOS]) {
      showArchivedRepos = changes[CONSTANTS.ARCHIVED_REPOS].newValue;
    }

    const autoSyncChange = changes[CONSTANTS.AUTOSYNC_REPOS];

    if (autoSyncChange) {
      autoSyncRepos = autoSyncChange.newValue;

      if (autoSyncRepos) {
        createAlarm(CONSTANTS.AUTOSYNC_REPOS, autoSyncRepos);
      } else {
        cancelAlarm(CONSTANTS.AUTOSYNC_REPOS);
      }

      return;
    }

    syncRepos(true);
  }
}

/**
 * Synchronizes local stored repositories
 *
 * @param {function} [callback]
 */
function syncLocalRepos(callback = () => { }) {
  browser.storage.local.get({
    repos: []
  }, data => {
    suggestionsCache = data.repos;
    callback(data.repos);
  });
}

/**
 * Returns the suggested repos cache if exists, otherwise syncs and returns repos
 *
 * @param {function} [callback] Callback function with cached repos array
 */
function getSuggestionsCache(callback = () => { }) {
  if (suggestionsCache && suggestionsCache.length) {
    return callback(suggestionsCache);
  }

  syncLocalRepos(repos => callback(repos));
}

/**
 * Fired on every input change
 *
 * @param {string} text User entered text
 * @param {function} suggest Opens the suggestions box
 */
function onInputChangedHandler(text, suggest) {
  getSuggestionsCache(cache => {
    const suggestions = highlightResults(text, cache);

    if (suggestions.length) {
      browser.omnibox.setDefaultSuggestion({ description: suggestions[0].description });

      if (isChrome) {
        suggestions.shift();
      }
    } else {
      const description = isFirefox ?
        `No repositories found matching "${text}"` :
        `No repositories found matching <match>${text}</match>`;

      browser.omnibox.setDefaultSuggestion({ description });
    }

    suggest(suggestions);
  });
}

/**
 * Navigates to the given URL or filters cached results if not url provided
 *
 * @param {string} userInput Text entered by the user
 * @param {string} disposition Describes how the extension should handle a user selection
 * from the suggestions in the address bar's drop-down list.
 */
function onInputEnteredHandler(userInput, disposition) {
  let url;

  try {
    url = new URL(userInput).href;
  } catch (error) {
    getSuggestionsCache(cache => {
      const suggestions = highlightResults(userInput, cache);

      if (suggestions.length) {
        url = suggestions[0].content;
      }
    });
  }

  if (url) {
    switch (disposition) {
      case 'newForegroundTab':
        browser.tabs.create({ url });
        break;
      case 'newBackgroundTab':
        browser.tabs.create({ url, active: false });
        break;
      case 'currentTab':
      default:
        browser.tabs.update({ url });
    }
  }
}

/**
 * Returns extension saved config
 *
 * @param {function} [callback] Callback function
 */
function getConfig(callback = () => { }) {
  browser.storage.sync.get({
    [CONSTANTS.TOKEN_NAME]: '',
    [CONSTANTS.AUTOSYNC_REPOS]: 30,
    [CONSTANTS.ARCHIVED_REPOS]: false
  }, config => callback(config));
}

/**
 * Run after extension is installed
 */
function onExtensionInstall() {
  getConfig(config => {
    if (!config[CONSTANTS.TOKEN_NAME]) {
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
}

/**
 * Browser alarms handler
 *
 * @param {Object} alarm Alarm data
 * @param {string} alarm.name Alarm name
 */
function onAlarmHandler({ name }) {
  if (name === CONSTANTS.AUTOSYNC_REPOS) {
    syncRepos();
  }
}

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

  browser.alarms.onAlarm.addListener(onAlarmHandler);

  browser.omnibox.setDefaultSuggestion({
    description: `Search for a Github Repo
    (e.g. "jquery")`
  });
}

/**
 * Called on plugin load
 */
function init() {
  registerListeners();

  if (isDarkMode) {
    browser.browserAction.setIcon({
      path: 'icons/icon48_light.png'
    });
  }

  getConfig(config => {
    try {
      showArchivedRepos = config[CONSTANTS.ARCHIVED_REPOS];
      autoSyncRepos = config[CONSTANTS.AUTOSYNC_REPOS];

      if (config[CONSTANTS.TOKEN_NAME]) {
        setToken(config[CONSTANTS.TOKEN_NAME]);

        syncLocalRepos(() => syncRepos(false, () => {
          if (autoSyncRepos) {
            createAlarm(CONSTANTS.AUTOSYNC_REPOS, autoSyncRepos);
          } else {
            cancelAlarm(CONSTANTS.AUTOSYNC_REPOS);
          }
        }));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
    }
  });
}

init();
