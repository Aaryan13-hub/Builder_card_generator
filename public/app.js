document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('particle-glow');
  const frame = canvas?.parentElement;
  const artWrap = document.querySelector('.headline-art-wrap');
  const divider = document.querySelector('.hero-divider');
  if (!canvas || !frame || !artWrap || !divider) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#f5d90a', '#f0338a'];
  const particleCount = 100;
  let particles = [];
  let animationId = null;
  let isVisible = true;
  let frameSize = { width: 0, height: 0 };
  let lastTime = performance.now();

  const createParticle = () => ({
    baseX: Math.random(),
    baseY: 0.45 + Math.random() * 0.35,
    orbit: 16 + Math.random() * 18,
    angle: Math.random() * Math.PI * 2,
    angularSpeed: 0.00008 + Math.random() * 0.00012,
    radius: 1.5 + Math.random() * 3.5,
    phase: Math.random() * Math.PI * 2,
    color: colors[Math.random() < 0.45 ? 0 : 1],
    opacity: 0.2 + Math.random() * 0.5,
  });

  const initParticles = () => {
    particles = Array.from({ length: particleCount }, createParticle);
  };

  const resizeCanvas = () => {
    const frameBounds = frame.getBoundingClientRect();
    const artBounds = artWrap.getBoundingClientRect();
    const dividerBounds = divider.getBoundingClientRect();
    const top = Math.max(0, artBounds.bottom - frameBounds.top);
    const bottom = Math.max(top + 1, dividerBounds.top - frameBounds.top);
    const height = Math.max(1, bottom - top);
    const width = Math.max(1, frameBounds.width);

    canvas.style.position = 'absolute';
    canvas.style.left = '0px';
    canvas.style.top = `${top}px`;
    canvas.style.height = `${height}px`;
    canvas.style.width = `${width}px`;
    canvas.width = Math.floor(width * window.devicePixelRatio);
    canvas.height = Math.floor(height * window.devicePixelRatio);
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    frameSize = { width, height };
  };

  const resetParticle = (particle) => {
    Object.assign(particle, createParticle());
  };

  const updateParticles = (dt) => {
    particles.forEach((particle) => {
      particle.angle += particle.angularSpeed * dt;
      particle.phase += 0.002 * dt;
    });
  };

  const drawParticles = () => {
    ctx.clearRect(0, 0, frameSize.width, frameSize.height);

    particles.forEach((particle) => {
      const x = particle.baseX * frameSize.width + Math.cos(particle.angle) * particle.orbit;
      const y = particle.baseY * frameSize.height + Math.sin(particle.angle) * (particle.orbit * 0.45);
      const alpha = particle.opacity * (0.6 + 0.4 * Math.cos(particle.angle * 0.7));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = particle.radius * 6;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };

  const renderStaticFrame = () => {
    resizeCanvas();
    if (!frameSize.width || !frameSize.height) return;
    ctx.clearRect(0, 0, frameSize.width, frameSize.height);
    particles.forEach((particle, index) => {
      // place static orbits evenly
      particle.angle = particle.angle || Math.random() * Math.PI * 2;
      particle.opacity = 0.28 + (index % 10) * 0.01;
      const x = particle.baseX * frameSize.width + Math.cos(particle.angle) * particle.orbit;
      const y = particle.baseY * frameSize.height + Math.sin(particle.angle) * (particle.orbit * 0.45);
      ctx.save();
      ctx.globalAlpha = particle.opacity;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = particle.radius * 5;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };

  const animate = (time) => {
    if (!isVisible) {
      animationId = null;
      return;
    }
    const delta = time - lastTime;
    lastTime = time;
    resizeCanvas();
    updateParticles(delta);
    drawParticles();
    animationId = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (animationId || prefersReducedMotion.matches || !isVisible) return;
    lastTime = performance.now();
    animationId = requestAnimationFrame(animate);
  };

  const stopAnimation = () => {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
  };

  const observer = new IntersectionObserver((entries) => {
    isVisible = entries.some((entry) => entry.isIntersecting);
    if (prefersReducedMotion.matches) {
      renderStaticFrame();
      return;
    }
    if (isVisible) startAnimation();
    else stopAnimation();
  }, { threshold: 0.1 });

  initParticles();
  resizeCanvas();

  if (prefersReducedMotion.matches) renderStaticFrame();
  else startAnimation();

  observer.observe(canvas);
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (prefersReducedMotion.matches) renderStaticFrame();
  });

  if (prefersReducedMotion.addEventListener) {
    prefersReducedMotion.addEventListener('change', () => {
      if (prefersReducedMotion.matches) {
        stopAnimation();
        renderStaticFrame();
      } else {
        startAnimation();
      }
    });
  }
});
