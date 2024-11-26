/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["Poppins", "sans-serif"],
        rubik: ["Rubik", "sans-serif"],
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      const newUtilities = {
        ".text-shadow": {
          textShadow: "0 2px 4px rgba(0, 0, 0, 0.10)",
        },
        ".text-shadow-md": {
          textShadow: "0 4px 6px rgba(0, 0, 0, 0.10)",
        },
        ".text-shadow-lg": {
          textShadow: "0 10px 15px rgba(0, 0, 0, 0.10)",
        },
        ".text-shadow-xl": {
          textShadow: "0 20px 25px rgba(0, 0, 0, 0.10)",
        },
      };

      addUtilities(newUtilities, ["responsive", "hover"]);
    },
  ],
};
