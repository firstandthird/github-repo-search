/**
 * Default config
 */
const TOKEN_NAME = 'gh_personal_token';
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
  return apiUrl;
}

/**
 * Filters a GitHub API response to match Chrome suggestions object
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
      const data = await response.json() || [];

      items = items.concat(data.map(formatAsSuggestion));

      if (response.status === 403 || !data.length || data.length < RESULTS_PER_PAGE) {
        isFetching = false;
        return items;
      }

      return await getRepos(page + 1, items);
    }
    catch (e) {
      isFetching = false;
      throw e;
    }
  };

  return getRepos();
}


/**
 * Fired on every input change
 */
chrome.omnibox.onInputChanged.addListener(
  (text, suggest) => {
    chrome.storage.sync.get({
      [TOKEN_NAME]: ''
    }, async item => {
      if (suggestionsCache.length || !item[TOKEN_NAME]) {
        suggest(highlightResults(text, suggestionsCache));
      } else {
        setToken(item[TOKEN_NAME]);
        suggestionsCache = await search();
        suggest(highlightResults(text, suggestionsCache));
      }
    });
  }
);

/**
 * Navigates to the given URL
 *
 * @param {string} url
 */
function navigate(url) {
  try {
    new URL(url);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.update(tabs[0].id, { url: url });
    });
  } catch (e) { }
}

/*
 * Redirects user to the selected suggestion URL
 */
chrome.omnibox.onInputEntered.addListener(
  (url, disposition) => {
    navigate(url);
  }
);
