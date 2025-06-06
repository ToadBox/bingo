/**
 * Common UI components for reuse across pages
 */

import { logout } from './utils.js';

/**
 * Creates and adds a site header to the document
 * @param {string} title - The title to display in the header
 * @param {boolean} showBackButton - Whether to show a back button
 * @returns {HTMLElement} - The created header element
 */
export function createHeader(title, showBackButton = false) {
  // Check if header already exists and remove it to prevent duplicates
  const existingHeader = document.querySelector('.site-header');
  if (existingHeader) {
    existingHeader.remove();
  }
  
  const header = document.createElement('header');
  header.className = 'site-header';
  
  // Back button (only for board page)
  if (showBackButton) {
    const backLink = document.createElement('a');
    backLink.href = '/';
    backLink.className = 'back-button';
    backLink.innerHTML = '&larr;';
    backLink.title = 'Back to boards';
    header.appendChild(backLink);
  }
  
  // Title
  const titleElement = document.createElement('h1');
  titleElement.textContent = title;
  titleElement.id = 'title';
  header.appendChild(titleElement);
  
  // Controls container (for logout and theme toggle)
  const controls = document.createElement('div');
  controls.className = 'controls';
  
  // Logout button
  const logoutButton = document.createElement('button');
  logoutButton.className = 'logout-button';
  logoutButton.textContent = 'Logout';
  logoutButton.title = 'Logout';
  logoutButton.addEventListener('click', logout);
  controls.appendChild(logoutButton);
  
  // Move existing theme toggle into header if it exists
  const existingThemeToggle = document.querySelector('.theme-toggle');
  if (existingThemeToggle) {
    controls.appendChild(existingThemeToggle);
  }
  
  header.appendChild(controls);
  
  // Add to document
  document.body.insertBefore(header, document.body.firstChild);
  
  return header;
} 