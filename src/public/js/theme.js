export function initTheme() {
  console.log('Initializing theme');
  
  // Check if theme toggle already exists
  if (document.querySelector('.theme-toggle')) {
    console.log('Theme toggle already exists, skipping initialization');
    return;
  }
  
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
  
  // Add the toggle at the end of body to avoid conflicts with other elements
  setTimeout(() => {
    document.body.appendChild(themeToggle);
    console.log('Theme toggle added to document');
  }, 100);
  
  // Add click handler
  themeToggle.addEventListener('click', (e) => {
    // Prevent event from affecting other elements
    e.stopPropagation();
    
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggle.innerHTML = newTheme === 'light' ? '🌙' : '☀️';
    
    console.log('Theme changed to', newTheme);
  });
} 