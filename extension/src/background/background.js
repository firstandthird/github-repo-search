const browser = window.browser || window.chrome;

/**
 * Default config
 */
const OPTIONS = {
  TOKEN_NAME: 'ogh_personal_token',
  REFRESH_TIME: 20,
  REFRESH_OPTION_ID: 'ogh-refresh'
};

const ALARMS = {
  REFRESH: 'ogh:refresh'
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
 * @param {array} data
 * @returns
 */
function formatAsSuggestion(data) {
  return {
    content: data.html_url,
    description: `${data.full_name} -`
  }
}

/**
 * Highlights matched text
 *
 * @param {string} text
 * @param {array} results
 * @returns
 */
function highlightResults(text, results) {
  try {
    const searchTextRegExp = new RegExp(text, 'i');

    return results
      .filter(suggestion => searchTextRegExp.test(suggestion.description))
      .slice(0, MAX_SUGGESTIONS)
      .map(res => {
        const match = res.description.replace(searchTextRegExp, `<match>$&</match>`);
        return {
          content: res.content,
          description: `<dim>${match}</dim> <url>${res.content}</url>`
        }
      });
  } catch (e) {
    return [];
  }
}

/**
 * Enables manual sync button
 */
function enableSyncButton() {
  setSyncButtonEnabled(true);
}

/**
 * Disables manual sync button
 */
function disableSyncButton() {
  setSyncButtonEnabled(false)
}

/**
 * Sets manual sync button available state (enabled/disabled)
 *
 * @param {boolean} enabled
 */
function setSyncButtonEnabled(enabled = true) {
  browser.contextMenus.update(OPTIONS.REFRESH_OPTION_ID, { enabled });
}

/**
 * Creates a notification with the specified params
 *
 * @param {string} [contextMessage='']
 * @param {string} [message='']
 * @param {boolean} [requireInteraction=false] If activated notification won't automatically close
 */
function createNotification(contextMessage = '', message = '', timeout = 5000, requireInteraction = false) {
  browser.notifications.create('ogh-notification', {
    iconUrl: '../../icons/icon48.png',
    type: 'basic',
    title: 'Omni GitHub',
    contextMessage,
    message,
    requireInteraction
  });

  if (timeout) {
    setTimeout(() => {
      browser.notifications.clear('ogh-notification');
    }, timeout);
  }
}

/**
 * Fetches GitHub user repos
 *
 * @returns {Promise}
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
      const data = await response.json();

      if (response.status >= 400) {
        throw response;
      }

      items = items.concat(data.map(formatAsSuggestion));

      if (!data.length || data.length < RESULTS_PER_PAGE) {
        isFetching = false;
        return items;
      }

      return await getRepos(page + 1, items);
    }
    catch (e) {
      isFetching = false;
      disableSyncButton();
      createNotification('Error syncing', 'Please provide a valid personal token in the options page', 5000);
      throw e;
    }
  };

  return getRepos();
}

/**
 * Creates a browser alarm, which will be fired every specified period of time
 *
 * @param {string} name Alarm name
 * @param {number} periodInMinutes
 */
function createAlarm(name, periodInMinutes) {
  browser.alarms.clear(name, browser.alarms.create(name, { periodInMinutes: parseInt(periodInMinutes) }));
}

/**
 * Adds context menu buttons
 */
function addContextButtons() {
  try {
    browser.contextMenus.create({
      id: OPTIONS.REFRESH_OPTION_ID,
      contexts: ['browser_action'],
      type: 'normal',
      title: 'Synchronize repositories',
      visible: true,
    });
  } catch(e) { }
}

/**
 * Handles browser storage changes
 *
 * @param {Object} changes
 * @param {string} areaName
 */
function onBrowserStorageChanged(changes, areaName) {
  if (areaName === 'sync') {
    if (changes[OPTIONS.TOKEN_NAME]) {
      setToken(changes[OPTIONS.TOKEN_NAME].newValue || changes[OPTIONS.TOKEN_NAME]);
      syncRepos(true);
      enableSyncButton();
    }

    if (changes[OPTIONS.REFRESH_TIME]) {
      createAlarm(ALARMS.REFRESH, changes[OPTIONS.REFRESH_TIME].newValue || changes[OPTIONS.REFRESH_TIME]);
    }
  }
}

/**
 * Fired on every input change
 *
 * @param {text} text User entered text
 * @param {function} suggest Opens the suggestions box
 */
async function onInputChangedHandler(text, suggest) {
  if (suggestionsCache.length) {
    suggest(highlightResults(text, suggestionsCache));
  } else {
    syncLocalRepos(data => {
      suggestionsCache = data.repos;
      suggest(highlightResults(text, suggestionsCache));
    });
  }
}

/**
 * Navigates to the given URL
 *
 * @param {string} url
 */
function navigate(url, disposition) {
  try {
    new URL(url);
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      browser.tabs.update(tabs[0].id, { url: url });
    });
  } catch (e) { }
}

/**
 * Synchronizes local stored repositories
 *
 * @param {function} callback
 */
async function syncLocalRepos(callback = () => { }) {
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
 * @param {boolean} notify If active, shows a success notification
 * @param {function} callback
 */
async function syncRepos(notify = false, callback = () => { }) {
  try {
    suggestionsCache = await search();

    browser.storage.local.set({ repos: suggestionsCache }, () => {
      if (notify) {
        createNotification('Synchronization finished!', 'Your GitHub repositories has been synchronized', 5000);
      }

      callback(suggestionsCache);
    });
  } catch (e) {

  }
}

/**
 * Register event listeners
 */
function registerListeners() {
  browser.storage.onChanged.addListener(onBrowserStorageChanged);
  browser.omnibox.onInputChanged.addListener(onInputChangedHandler);
  browser.omnibox.onInputEntered.addListener(navigate);
  browser.omnibox.onInputStarted.addListener(syncLocalRepos);
  browser.contextMenus.onClicked.addListener(() => syncRepos(true));
  browser.alarms.onAlarm.addListener(syncRepos);
}

/**
 * Called on plugin load
 */
function init() {
  addContextButtons();
  registerListeners();

  browser.storage.sync.get({
    [OPTIONS.TOKEN_NAME]: '',
    [OPTIONS.REFRESH_TIME]: OPTIONS.REFRESH_TIME
  }, userConfig => {
    try {
      if (userConfig[OPTIONS.TOKEN_NAME]) {
        setToken(userConfig[OPTIONS.TOKEN_NAME]);
        syncLocalRepos(data => {
          syncRepos();
          createAlarm(ALARMS.REFRESH, userConfig[OPTIONS.REFRESH_TIME]);
        });
      } else {
        disableSyncButton();
      }
    } catch (error) {
      console.log(error);
    }
  });
}

init();
