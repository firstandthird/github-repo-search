const browser = window.browser || window.chrome;

const OPTIONS = {
  TOKEN_NAME: 'ogh_personal_token',
  REFRESH_TIME: 20
};

/**
 * Saves options to browser.storage
 */
function saveOptions(e) {
  e.preventDefault();

  const token = document.getElementById('token').value;
  const refresh = document.getElementById('refresh').value;

  browser.storage.sync.set({
    [OPTIONS.TOKEN_NAME]: token,
    [OPTIONS.REFRESH_TIME]: refresh
  }, () => {
    const status = document.getElementById('status');

    status.textContent = 'Options saved.';

    setTimeout(() => {
      status.textContent = '';
    }, 750);
  });
}

/**
 * Restores previously saved token
 */
function restoreOptions() {
  browser.storage.sync.get({
    [OPTIONS.TOKEN_NAME]: '',
    [OPTIONS.REFRESH_TIME]: OPTIONS.REFRESH_TIME
  }, item => {
    document.getElementById('token').value = item[OPTIONS.TOKEN_NAME];
    document.getElementById('refresh').value = item[OPTIONS.REFRESH_TIME];
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('options-form').addEventListener('submit', saveOptions);
