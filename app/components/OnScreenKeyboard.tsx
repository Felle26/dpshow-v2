'use client';

import React, { useMemo, useState } from 'react';

interface OnScreenKeyboardProps {
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  onClose?: () => void;
  numericOnly?: boolean;
  displayLabel?: string;
  maskDisplay?: boolean;
}

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;
const UMLAUT_KEYS = ['ä', 'ö', 'ü'] as const;

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
const PIN_PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'] as const;

export function OnScreenKeyboard({
  value,
  onChange,
  onEnter,
  onClose,
  numericOnly = false,
  displayLabel,
  maskDisplay = false,
}: OnScreenKeyboardProps) {
  const [caps, setCaps] = useState(false);

  const rows = useMemo(
    () => LETTER_ROWS.map((row) => row.map((char) => (caps ? char.toUpperCase() : char))),
    [caps]
  );

  const umlautKeys = useMemo(
    () => UMLAUT_KEYS.map((char) => (caps ? char.toUpperCase() : char)),
    [caps]
  );

  const addChar = (char: string) => {
    onChange(`${value}${char}`);
  };

  const backspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleEnter = () => {
    if (onEnter) {
      onEnter();
    }

    if (onClose) {
      onClose();
    }
  };

  const baseButtonClass =
    'min-h-12 rounded-lg border border-gray-300 bg-white px-3 text-lg font-semibold text-gray-900 transition-colors hover:bg-gray-100 active:bg-gray-200 dark:border-gray-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700';

  const displayedValue = maskDisplay ? '•'.repeat(value.length) : value;
  const effectiveLabel = displayLabel ?? (numericOnly ? 'PIN-Eingabe' : 'Eingabe');

  return (
    <div className="mt-3 rounded-xl border border-gray-300 bg-gray-100 p-3 shadow-inner dark:border-gray-700 dark:bg-slate-900">
      <div className="mb-3 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {effectiveLabel}
        </p>
        <p className="mt-1 min-h-7 break-all font-mono text-lg font-semibold text-gray-900 dark:text-white">
          {displayedValue || ' '}
        </p>
      </div>

      {numericOnly ? (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {PIN_PAD_KEYS.map((key) => {
            if (key === 'clear') {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange('')}
                  className={baseButtonClass}
                >
                  C
                </button>
              );
            }

            if (key === 'backspace') {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={backspace}
                  className={baseButtonClass}
                >
                  ⌫
                </button>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => addChar(key)}
                className={baseButtonClass}
              >
                {key}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-10 gap-2">
            {NUMBER_ROW.map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => addChar(digit)}
                className={baseButtonClass}
              >
                {digit}
              </button>
            ))}
          </div>

          {rows.map((row, rowIndex) => (
            <div
              key={`row-${rowIndex}`}
              className={`mb-2 grid gap-2 ${rowIndex === 1 ? 'grid-cols-9 px-6' : rowIndex === 2 ? 'grid-cols-7 px-12' : 'grid-cols-10'}`}
            >
              {row.map((char) => (
                <button
                  key={char}
                  type="button"
                  onClick={() => addChar(char)}
                  className={baseButtonClass}
                >
                  {char}
                </button>
              ))}
            </div>
          ))}

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setCaps((v) => !v)}
              className={`${baseButtonClass} ${caps ? 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-500 dark:text-white' : ''}`}
            >
              ⇧ Shift
            </button>
            <button
              type="button"
              onClick={backspace}
              className={baseButtonClass}
            >
              ⌫ Zurueck
            </button>
            <button
              type="button"
              onClick={() => addChar(' ')}
              className={baseButtonClass}
            >
              ␣ Leer
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className={baseButtonClass}
            >
              ✖ Leeren
            </button>
          </div>

          <div className="mb-2 mt-2 grid grid-cols-3 gap-2 px-24">
            {umlautKeys.map((char) => (
              <button
                key={char}
                type="button"
                onClick={() => addChar(char)}
                className={baseButtonClass}
              >
                {char}
              </button>
            ))}
          </div>
        </>
      )}

      {!numericOnly && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleEnter}
            className="min-h-12 rounded-lg bg-green-500 px-4 text-lg font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
          >
            ↵ Enter
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-lg bg-gray-500 px-4 text-lg font-semibold text-white transition-colors hover:bg-gray-600 active:bg-gray-700"
          >
            ⤫ Tastatur schließen
          </button>
        </div>
      )}
    </div>
  );
}
