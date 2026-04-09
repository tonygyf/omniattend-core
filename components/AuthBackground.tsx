import React from 'react';
import { motion } from 'framer-motion';

// 更多星星，分布更广
const AUTH_STARS = Array.from({ length: 80 }).map((_, i) => ({
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  delay: Math.random() * 2,
  size: Math.random() * 3 + 1, // 1-4px
  duration: Math.random() * 3 + 2,
}));

// 流星群特效：分布在整个屏幕上方及右侧，确保左侧也能看到，且延迟重叠更密集
const AUTH_METEORS = Array.from({ length: 25 }).map((_, i) => {
  // 让起点覆盖更广：
  // top 范围从 -30% 到 60%
  // left 范围从 20% 到 180% (因为它们向左下方划过，left 需要大一些才能覆盖右侧，left 小一些覆盖左侧)
  const top = Math.random() * 90 - 30; 
  const left = Math.random() * 160 + 20;
  
  // 让出现时间更密集，多颗流星同时出现
  const delay = Math.random() * 3; // 0~3秒内随机出现
  const duration = Math.random() * 1.5 + 1.5; // 1.5s ~ 3s 的划过速度
  const width = Math.random() * 300 + 200; // 长度 200px ~ 500px

  return { top: `${top}%`, left: `${left}%`, delay, duration, width };
});

export const AuthBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-[#09090b]">
      {/* Background Gradient & Pattern */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#09090b] via-[#1e1b4b] to-[#3b0764] z-0">
        {/* 底部动漫风格紫色光晕 */}
        <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-pink-900/40 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.1),transparent_50%)]" />
        
        {/* Stars */}
        {AUTH_STARS.map((star, idx) => (
          <motion.span
            key={`auth-star-${idx}`}
            className="absolute rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
            style={{ 
              top: star.top, 
              left: star.left, 
              width: star.size, 
              height: star.size 
            }}
            animate={{ opacity: [0.1, 0.8, 0.1], scale: [0.8, 1.2, 0.8] }}
            transition={{ 
              duration: star.duration, 
              delay: star.delay, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          />
        ))}

        {/* Meteors */}
        {AUTH_METEORS.map((meteor, idx) => (
          <motion.span
            key={`auth-meteor-${idx}`}
            className="absolute h-[2px] rounded-full bg-gradient-to-l from-transparent via-cyan-300 to-white shadow-[0_0_15px_rgba(255,255,255,1)]"
            style={{ 
              top: meteor.top, 
              left: meteor.left, 
              width: meteor.width
            }}
            initial={{ x: 0, y: 0, opacity: 0, rotate: -45 }}
            animate={{ x: -2000, y: 2000, opacity: [0, 1, 1, 0], rotate: -45 }}
            transition={{ duration: meteor.duration, delay: meteor.delay, repeat: Infinity, ease: "linear" }}
          />
        ))}
      </div>

      {/* Content wrapper with relative z-index so it sits above background */}
      <div className="relative z-10 w-full flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
};
