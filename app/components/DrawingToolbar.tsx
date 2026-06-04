'use client';

import React from 'react';

export type DrawingColor = '#000000' | '#FF0000' | '#00AA00' | '#0000FF' | '#FFAA00';
export type DrawingTool = 'brush' | 'eraser' | 'text';
export type TextBackgroundColor = 'yellow' | 'green' | 'blue' | 'pink';

interface DrawingToolbarProps {
  currentColor: DrawingColor;
  currentTextBackground: TextBackgroundColor;
  currentTool: DrawingTool;
  textInput: string;
  fontSize: number;
  onColorChange: (color: DrawingColor) => void;
  onTextBackgroundChange: (color: TextBackgroundColor) => void;
  onToolChange: (tool: DrawingTool) => void;
  onTextChange: (text: string) => void;
  onFontSizeChange: (size: number) => void;
  onSave: () => Promise<void>;
  onClear: () => void;
  isSaving: boolean;
  showLayersPanel: boolean;
  onLayersToggle: () => void;
  onTextKeyboardShow: () => void;
}

const COLORS: DrawingColor[] = ['#000000', '#FF0000', '#00AA00', '#0000FF', '#FFAA00'];
const COLOR_NAMES: Record<DrawingColor, string> = {
  '#000000': 'Schwarz',
  '#FF0000': 'Rot',
  '#00AA00': 'Grün',
  '#0000FF': 'Blau',
  '#FFAA00': 'Orange',
};

const TEXT_BACKGROUND_COLORS: Array<{ key: TextBackgroundColor; label: string; fill: string }> = [
  { key: 'yellow', label: 'Gelb', fill: '#fef08a' },
  { key: 'green', label: 'Grün', fill: '#bbf7d0' },
  { key: 'blue', label: 'Blau', fill: '#bfdbfe' },
  { key: 'pink', label: 'Pink', fill: '#fbcfe8' },
];

export function DrawingToolbar({
  currentColor,
  currentTextBackground,
  currentTool,
  textInput,
  fontSize,
  onColorChange,
  onTextBackgroundChange,
  onToolChange,
  onTextChange,
  onFontSizeChange,
  onSave,
  onClear,
  isSaving,
  showLayersPanel,
  onLayersToggle,
  onTextKeyboardShow,
}: DrawingToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-5 border-b border-gray-300 bg-white p-5 dark:border-gray-700 dark:bg-slate-900">
      {/* Farb-Buttons */}
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Farben:</span>
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            title={COLOR_NAMES[color]}
            className={`h-11 w-11 rounded-lg border-2 transition-transform ${
              currentTool === 'brush' && currentColor === color
                ? 'border-gray-800 dark:border-white scale-110'
                : 'border-gray-400 dark:border-gray-600 hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Tool-Buttons */}
      <div className="flex items-center gap-2 border-l border-gray-300 pl-5 dark:border-gray-700">
        <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Tools:</span>
        <button
          onClick={() => onToolChange('brush')}
          className={`min-h-12 rounded-lg px-5 py-3 text-base font-semibold transition-colors ${
            currentTool === 'brush'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          🖌️ Pinsel
        </button>
        <button
          onClick={() => onToolChange('eraser')}
          className={`min-h-12 rounded-lg px-5 py-3 text-base font-semibold transition-colors ${
            currentTool === 'eraser'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          🧹 Radierer
        </button>
        <button
          onClick={() => onToolChange('text')}
          className={`min-h-12 rounded-lg px-5 py-3 text-base font-semibold transition-colors ${
            currentTool === 'text'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          ✏️ Text
        </button>
      </div>

      {/* Text Input & Font Size */}
      {currentTool === 'text' && (
        <div className="flex items-start gap-3 border-l border-gray-300 pl-5 dark:border-gray-700">
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Text eingeben..."
              value={textInput}
              onFocus={onTextKeyboardShow}
              onClick={onTextKeyboardShow}
              onChange={(e) => onTextChange(e.target.value)}
              className="w-56 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 dark:border-gray-600 dark:bg-slate-800 dark:text-white"
            />
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Größe:</span>
              <button
                type="button"
                onClick={() => onFontSizeChange(16)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  fontSize === 16
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                }`}
              >
                16px
              </button>
              <button
                type="button"
                onClick={() => onFontSizeChange(40)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  fontSize === 40
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                }`}
              >
                40px
              </button>
              <button
                type="button"
                onClick={() => onFontSizeChange(52)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  fontSize === 52
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                }`}
              >
                52px
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Hintergrund:</span>
              {TEXT_BACKGROUND_COLORS.map((bg) => (
                <button
                  key={bg.key}
                  type="button"
                  onClick={() => onTextBackgroundChange(bg.key)}
                  title={bg.label}
                  className={`h-9 w-9 rounded-md border-2 transition-transform ${
                    currentTextBackground === bg.key
                      ? 'border-gray-800 dark:border-white scale-105'
                      : 'border-gray-400 dark:border-gray-600 hover:scale-105'
                  }`}
                  style={{ backgroundColor: bg.fill }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action-Buttons */}
      <div className="flex items-center gap-2 border-l border-gray-300 pl-5 dark:border-gray-700">
        <button
          onClick={onLayersToggle}
          className={`min-h-12 rounded-lg px-5 py-3 text-base font-semibold transition-colors ${
            showLayersPanel
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          🗂️ Ebenen
        </button>
        <button
          onClick={onClear}
          className="min-h-12 rounded-lg bg-red-500 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-red-600"
        >
          🗑️ Löschen
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className={`min-h-12 rounded-lg px-5 py-3 text-base font-semibold transition-colors ${
            isSaving
              ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {isSaving ? '💾 Speichert...' : '💾 Speichern'}
        </button>
      </div>
    </div>
  );
}
