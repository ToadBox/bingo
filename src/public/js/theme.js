export function initTheme() {
  // Check if theme toggle already exists
  if (document.querySelector('.theme-toggle')) return;
  
  // Check if user has a saved preference
  const savedTheme = localStorage.getItem('theme');
  
  // If no saved preference, check system preference
  if (!savedTheme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  
  // Create theme toggle button
  const themeToggle = document.createElement('button');
  themeToggle.className = 'theme-toggle';
  themeToggle.innerHTML = document.documentElement.getAttribute('data-theme') === 'light' ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', 'Toggle theme');
  
  // Position the toggle button
  themeToggle.style.position = 'fixed';
  themeToggle.style.bottom = '1rem';
  themeToggle.style.right = '1rem';
  
  document.body.appendChild(themeToggle);
  
  // Add click handler
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggle.innerHTML = newTheme === 'light' ? '🌙' : '☀️';
  });
} 