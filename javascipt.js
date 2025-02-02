document.addEventListener("DOMContentLoaded", function () {
  const sections = document.querySelectorAll(".section");
  let currentSection = 0;

  function fadeIn(element) {
    element.classList.remove("fade-out");
    element.classList.add("fade-in");
  }

  function fadeOut(element) {
    element.classList.remove("fade-in");
    element.classList.add("fade-out");
  }

  function handleScroll() {
    const scrollPosition = window.scrollY;
    const windowHeight = window.innerHeight;

    sections.forEach((section, index) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;

      if (
        scrollPosition >= sectionTop - windowHeight / 2 &&
        scrollPosition < sectionTop + sectionHeight - windowHeight / 2
      ) {
        if (currentSection !== index) {
          fadeOut(sections[currentSection]);
          fadeIn(section);
          currentSection = index;
        }
      }
    });
  }

  window.addEventListener("scroll", handleScroll);

  // Initial fade-in for the first section
  fadeIn(sections[currentSection]);
});
