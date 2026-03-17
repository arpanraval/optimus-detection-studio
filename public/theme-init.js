// Theme initialization — prevents Flash of Unstyled Content (FOUC)
if (localStorage.theme === 'light') {
  document.documentElement.classList.remove('dark');
} else {
  document.documentElement.classList.add('dark');
}
