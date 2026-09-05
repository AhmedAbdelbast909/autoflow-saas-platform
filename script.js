document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });

  // Simple CTA handler
  const formBtn = document.querySelector('.cta-form button');
  const formInput = document.querySelector('.cta-input');

  if (formBtn && formInput) {
    formBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const email = formInput.value.trim();
      if (email && email.includes('@')) {
        alert('شكراً لتسجيلك! سنتواصل معك قريباً.');
        formInput.value = '';
      } else {
        alert('يرجى إدخال بريد إلكتروني صالح.');
      }
    });
  }
});
