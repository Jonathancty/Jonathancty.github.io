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

// Canvas animation for dynamic gradient background
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let gradientOffset = 0;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawGradient();
}

function drawGradient() {
  gradientOffset += 0.001;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, `hsl(${Math.sin(gradientOffset) * 360}, 100%, 50%)`);
  gradient.addColorStop(1, `hsl(${Math.cos(gradientOffset) * 360}, 100%, 50%)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  requestAnimationFrame(drawGradient);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
