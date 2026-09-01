// privacy.js
//
// This page intentionally does NOT load the main script.js — that file
// assumes booking-form/testimonial elements exist on the page (it wires up
// event listeners on them unconditionally at load time) and would throw on
// a page that doesn't have them. This is just the handful of interactive
// bits shared with the rest of the site: the mobile nav toggle, the
// back-to-top button, and the footer year.

const menuButton = document.getElementById("menuButton");
const navMenu = document.getElementById("navMenu");
const backToTopButton = document.getElementById("backToTop");
const yearElement = document.getElementById("year");

yearElement.textContent = new Date().getFullYear();

menuButton.addEventListener("click", () => {
  const isOpen = navMenu.classList.toggle("show");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

navMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
  });
});

window.addEventListener("scroll", () => {
  backToTopButton.classList.toggle("show", window.scrollY > 420);
});

backToTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
