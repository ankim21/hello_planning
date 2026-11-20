import { useEffect, useRef, useState } from "react";
import {
  addDays,
  capitalise,
  dayLabel,
  mondayOf,
  today,
  weekNumber,
} from "./dates.ts";

/**
 * The dates at the top left: shows the week, and opens a month calendar with
 * week numbers to jump to any day.
 */
export function WeekPicker({
  day,
  onPick,
  byWeek = false,
}: {
  day: string;
  onPick: (day: string) => void;
  /** The planning picks a whole week: no single day is marked. */
  byWeek?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(day.slice(0, 7)); // YYYY-MM on display
  const box = useRef<HTMLSpanElement>(null);
  const monday = mondayOf(day);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const first = `${month}-01`;
  const start = mondayOf(first);
  // Six weeks always cover a month.
  const weeks = Array.from({ length: 6 }, (_, w) =>
    addDays(start, w * 7),
  ).filter((weekStart, w) => w === 0 || weekStart.slice(0, 7) === month);
  const shift = (months: number) => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + months, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  const pick = (date: string) => {
    onPick(date);
    setOpen(false);
  };

  return (
    <span className="week-picker" ref={box}>
      <button
        className="dates"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMonth(day.slice(0, 7));
          setOpen(!open);
        }}
      >
        {dayLabel(monday, { day: "numeric", month: "short" })} –{" "}
        {dayLabel(addDays(monday, 6), {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </button>
      {open && (
        <div
          className={byWeek ? "calendar panel by-week" : "calendar panel"}
          role="dialog"
          aria-label={byWeek ? "Choisir une semaine" : "Choisir une date"}
        >
          <div className="row">
            <button onClick={() => shift(-1)} aria-label="Mois précédent">
              ‹
            </button>
            <strong>
              {capitalise(dayLabel(first, { month: "long", year: "numeric" }))}
            </strong>
            <button onClick={() => shift(1)} aria-label="Mois suivant">
              ›
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th />
                {["lu", "ma", "me", "je", "ve", "sa", "di"].map((name) => (
                  <th key={name}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((weekStart) => (
                <tr
                  key={weekStart}
                  className={weekStart === monday ? "current" : ""}
                >
                  <th>S{weekNumber(weekStart)}</th>
                  {Array.from({ length: 7 }, (_, i) =>
                    addDays(weekStart, i),
                  ).map((date) => (
                    <td key={date}>
                      <button
                        className={[
                          !byWeek && date === day ? "picked" : "",
                          date === today() ? "today" : "",
                          date.slice(0, 7) === month ? "" : "other",
                        ].join(" ")}
                        onClick={() => pick(date)}
                      >
                        {Number(date.slice(8))}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link" onClick={() => pick(today())}>
            Aujourd'hui
          </button>
        </div>
      )}
    </span>
  );
}
