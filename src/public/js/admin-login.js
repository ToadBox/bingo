import { initTheme } from './theme.js';

// Initialize theme
initTheme();

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        
        if (!password) {
            showError('Password is required');
            return;
        }
        
        try {
            const response = await fetch('/api/auth/admin-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });
            
            if (response.ok) {
                // Login successful, redirect to admin page
                window.location.href = '/admin';
            } else {
                const data = await response.json();
                showError(data.error || 'Invalid admin password');
            }
        } catch (error) {
            showError('An error occurred while logging in');
            console.error('Login error:', error);
        }
    });
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Hide error after 5 seconds
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }
}); 