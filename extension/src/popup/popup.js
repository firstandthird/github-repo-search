const browser = window.browser || window.chrome;
const bgPage = browser.extension.getBackgroundPage();
const status = bgPage.getStatus();

const optionsButton = document.getElementById('options');
const syncButton = document.getElementById('sync');

function disableButton() {
  syncButton.disabled = true;
  syncButton.textContent = 'Syncing'
}

if (status.isFetching) {
  disableButton();
}

optionsButton.addEventListener('click', () => bgPage.openOptionsPage());
syncButton.addEventListener('click', () => {
  disableButton();
  bgPage.syncRepos(true);
});
