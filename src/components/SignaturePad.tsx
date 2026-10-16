import React, { useRef, useState, useEffect } from "react";
import { X, Check, RotateCcw } from "lucide-react";

interface SignaturePadProps {
  onSave: (signature: string) => void;
  onClear?: () => void;
  label?: string;
}

export function SignaturePad({ onSave, onClear, label }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    
    // Scale for high DPI
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent | React.MouseEvent).clientX;
      clientY = (e as MouseEvent | React.MouseEvent).clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.lineTo(x, y);
    ctx?.stroke();
    e.preventDefault();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    if (onClear) onClear();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div className="space-y-2">
      {label && <label className="block text-xs font-bold text-gray-700">{label}</label>}
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white h-40">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full cursor-crosshair touch-none"
        />
        <div className="absolute top-2 right-2 flex gap-2">
          <button onClick={clear} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors">
            <RotateCcw size={14} />
          </button>
          <button onClick={save} className="p-1.5 bg-green-100 hover:bg-green-200 rounded-full text-green-600 transition-colors">
            <Check size={14} />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 text-center italic">وقع هنا ثم اضغط على علامة الصح للحفظ</p>
    </div>
  );
}
