export function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Logs the user out by making a request to the logout endpoint
 * and redirecting to the login page
 */
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Add credentials to ensure cookies are sent
            credentials: 'same-origin'
        });
        
        if (response.ok) {
            console.log('Logout successful, redirecting to login page');
            window.location.href = '/login.html';
        } else {
            console.error('Logout API call failed, trying direct navigation');
            // Fallback to direct navigation if the API call fails
            window.location.href = '/api/auth/logout';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Network error fallback - go straight to login page
        window.location.href = '/login.html';
    }
}

// Export functions
export {
    logout
};
