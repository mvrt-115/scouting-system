'use client';

import { useEffect, useRef } from 'react';

export default function GearAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let rotation = 0;

    const drawGear = (x: number, y: number, radius: number, teeth: number, rot: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const r = i % 2 === 0 ? radius : radius * 0.8;
        const angle = (i * Math.PI) / teeth;
        ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw a few gears
      drawGear(canvas.width * 0.2, canvas.height * 0.3, 80, 12, rotation, '#7e22ce'); // Purple
      drawGear(canvas.width * 0.8, canvas.height * 0.7, 100, 16, -rotation * 0.75, '#4c1d95'); // Dark Purple
      drawGear(canvas.width * 0.5, canvas.height * 0.5, 60, 10, rotation * 1.5, '#a855f7'); // Light Purple

      rotation += 0.01;
      animationFrameId = requestAnimationFrame(draw);
    };

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full opacity-30" />;
}
