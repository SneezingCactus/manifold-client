import browser from 'webextension-polyfill';

const injectorScript = document.createElement('script');
injectorScript.src = browser.runtime.getURL('js/manifoldClientInjector.js');
document.head.prepend(injectorScript);
