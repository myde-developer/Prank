// animations.js
export function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.style.opacity = '0';
  setTimeout(() => { if(loader) loader.style.display = 'none'; }, 500);
}

export function startCountdown(targetDate, elementId) {
  const interval = setInterval(() => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) { clearInterval(interval); document.getElementById(elementId).innerHTML = "Match Live!"; return; }
    const days = Math.floor(diff/(1000*60*60*24));
    const hours = Math.floor((diff/(1000*60*60))%24);
    const mins = Math.floor((diff/(1000*60))%60);
    document.getElementById(elementId).innerHTML = `${days}d ${hours}h ${mins}m`;
  }, 1000);
}