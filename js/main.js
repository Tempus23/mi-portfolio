// Main JavaScript file

document.addEventListener('DOMContentLoaded', function() {
    console.log('Portfolio loaded successfully!');
    
    // Mobile menu functionality will be added in Phase 2
    const mobileMenuButton = document.createElement('button');
    mobileMenuButton.classList.add('mobile-menu-button');
    mobileMenuButton.innerHTML = '☰ Menu';
    
    const header = document.querySelector('header');
    if (header) {
        header.prepend(mobileMenuButton);
    }
    
    // Add event listeners for mobile menu
    mobileMenuButton.addEventListener('click', function() {
        // Mobile menu toggle functionality will be implemented in Phase 2
        console.log('Mobile menu clicked');
    });
});

// Form validation function (will be used in Phase 2)
function validateForm(formData) {
    // Form validation logic will be added in Phase 2
    return true;
}
