console.log('Service worker loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Smart Copy Page extension installed');
});
