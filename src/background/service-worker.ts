console.log('Service worker loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('DataPluck extension installed');
});
