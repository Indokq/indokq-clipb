import { useState, useEffect } from 'react';

export const useSpinner = (isActive: boolean) => {
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % 10);
    }, 80);
    
    return () => clearInterval(interval);
  }, [isActive]);

  return spinnerFrame;
};
