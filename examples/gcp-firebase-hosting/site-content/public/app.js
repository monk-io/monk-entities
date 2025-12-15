// Firebase Hosting Demo - Client JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Display current timestamp
  const deployTime = document.getElementById('deploy-time');
  if (deployTime) {
    deployTime.textContent = new Date().toLocaleString();
  }

  // Add animation to cards on scroll
  const cards = document.querySelectorAll('.card');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, {
    threshold: 0.1
  });

  cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(card);
  });

  // Log page view
  console.log('Firebase Hosting Demo loaded at:', new Date().toISOString());
  console.log('Deployed with Monk - https://monk.io');
});
