import React, { useState, useEffect } from 'react';

const TIMER_KEY = 'hulk_bike_timer_end';
const DEFAULT_DURATION = 3600; // 1 hour in seconds

export function Timer() {
  const [isVisible, setIsVisible] = useState(true);
  const [time, setTime] = useState(() => {
    // Try to get saved end time from localStorage
    const savedEndTime = localStorage.getItem(TIMER_KEY);
    
    if (savedEndTime) {
      const remainingTime = Math.floor((parseInt(savedEndTime) - Date.now()) / 1000);
      return remainingTime > 0 ? remainingTime : 0;
    }
    
    // If no saved time, set new end time
    const endTime = Date.now() + (DEFAULT_DURATION * 1000);
    localStorage.setItem(TIMER_KEY, endTime.toString());
    return DEFAULT_DURATION;
  });

  useEffect(() => {
    if (time <= 0) {
      setIsVisible(false);
      localStorage.removeItem(TIMER_KEY);
      return;
    }

    const timer = setInterval(() => {
      setTime((prevTime) => {
        const newTime = prevTime - 1;
        if (newTime <= 0) {
          setIsVisible(false);
          localStorage.removeItem(TIMER_KEY);
          clearInterval(timer);
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [time]);

  if (!isVisible) {
    return null;
  }

  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = time % 60;

  return (
    <div className="flex gap-2 text-2xl font-bold" style={{
      textShadow: '2px 2px 0 #000'
    }}>
      <span>{String(hours).padStart(2, '0')}</span>:
      <span>{String(minutes).padStart(2, '0')}</span>:
      <span>{String(seconds).padStart(2, '0')}</span>
    </div>
  );
}