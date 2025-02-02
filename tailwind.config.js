/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["Poppins", "sans-serif"],
        rubik: ["Rubik", "sans-serif"],
      },
      animation: {
        "gradient-x": "gradient-x 15s ease infinite",
        fadeIn: "fadeIn 0.5s ease-in forwards",
        fadeOut: "fadeOut 0.5s ease-out forwards",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        fadeOut: {
          "0%": { opacity: 1 },
          "100%": { opacity: 0 },
        },
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
