// STEP 9a — Search bar with autocomplete dropdown.
//
// Two patterns from real-world search UX:
//   1. Debounce the typing → suggest call by 200ms. Without this, every
//      keystroke triggers a network round trip and the dropdown flickers.
//   2. AbortController on every fetch — when the user keeps typing, we
//      cancel the in-flight request rather than letting it race the next
//      one. Last-write-wins ordering on async fetches is a classic source
//      of "old result briefly flashes" bugs.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { SuggestResponse } from '../types';

interface Props {
  initialValue: string;
  onSubmit: (q: string) => void;
}

export const SearchBar = ({ initialValue, onSubmit }: Props) => {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SuggestResponse['hits']>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Sync from parent (URL-driven changes — e.g. ?q= on first load).
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Debounced suggest fetch.
  useEffect(() => {
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .suggest(value, controller.signal)
        .then((res) => setSuggestions(res.hits))
        .catch((err) => {
          if (err.name !== 'AbortError') {
            // Suggest failures shouldn't crash the page — clearing is fine.
            setSuggestions([]);
          }
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value]);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const submit = (q: string): void => {
    setOpen(false);
    onSubmit(q.trim());
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        navigate(`/recipe/${suggestions[activeIdx].id}`);
      } else {
        submit(value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="searchbar" ref={wrapRef}>
      <input
        type="search"
        className="searchbar-input"
        placeholder="Search recipes — try 'pasta', 'chicken', 'dessert'..."
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      <button className="searchbar-btn" onClick={() => submit(value)} type="button">
        Search
      </button>
      {open && suggestions.length > 0 && (
        <ul className="searchbar-dropdown">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              className={i === activeIdx ? 'active' : ''}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                // mousedown (not click) so the dropdown doesn't lose
                // focus before we navigate.
                e.preventDefault();
                navigate(`/recipe/${s.id}`);
              }}
            >
              <img src={s.thumbnail} alt="" loading="lazy" />
              <div>
                <div className="suggestion-name">{s.name}</div>
                <div className="suggestion-cat">{s.category}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
