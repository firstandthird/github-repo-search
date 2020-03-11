const browser = window.browser || window.chrome;

const CONSTANTS = {
  TOKEN_NAME: 'ogh_personal_token',
  ARCHIVED_REPOS: 'archived',
  AUTOSYNC_REPOS: 'autosync'
};

/**
 * Saves options to browser.storage
 */
function saveOptions(event) {
  event.preventDefault();

  const token = document.getElementById('token').value;
  const autosync = document.getElementById('autosync').value;
  const archived = document.getElementById('archived').checked;

  browser.storage.sync.set({
    [CONSTANTS.TOKEN_NAME]: token,
    [CONSTANTS.AUTOSYNC_REPOS]: autosync,
    [CONSTANTS.ARCHIVED_REPOS]: archived
  }, () => {
    const status = document.getElementById('status');

    status.textContent = 'Options saved.';

    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

/**
 * Restores previously saved token
 */
function restoreOptions() {
  browser.storage.sync.get({
    [CONSTANTS.TOKEN_NAME]: '',
    [CONSTANTS.AUTOSYNC_REPOS]: 30,
    [CONSTANTS.ARCHIVED_REPOS]: false
  }, item => {
    document.getElementById('token').value = item[CONSTANTS.TOKEN_NAME];
    document.getElementById('autosync').value = item[CONSTANTS.AUTOSYNC_REPOS];
    document.getElementById('archived').checked = item[CONSTANTS.ARCHIVED_REPOS];
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('options-form').addEventListener('submit', saveOptions);
