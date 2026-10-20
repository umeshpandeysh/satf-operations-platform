"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  PlaneLanding,
  PlaneTakeoff,
  Compass,
  AlertTriangle,
  MapPin,
  Users,
  Car,
  UserCheck,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Badge,
} from "@/components/ui/Primitives";
import type { Tour, TourStatus } from "@/lib/types";
import {
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  mergeSessionTours,
  parseSessionSnapshot,
} from "@/lib/session-store";
import {
  formatDate,
  relativeDayLabel,
} from "@/lib/utils";
import { cn } from "@/components/ui/utils";
import { useLanguage } from "@/lib/i18n";

export interface CalendarViewProps {
  initialTours: Tour[];
  referenceDate: string;
}

interface CalendarEvent {
  id: string;
  tourId: string;
  bookingReference: string;
  groupName: string;
  date: string;
  type: "arrival" | "departure" | "itinerary";
  title: string;
  subtext: string;
  status: TourStatus;
  time?: string;
  details?: {
    flightNumber?: string;
    terminal?: string;
    pax?: number;
    destination?: string;
    guideName?: string;
    driverName?: string;
    vehicleType?: string;
  };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_JA = ["月", "火", "水", "木", "金", "土", "日"];

export function CalendarView({ initialTours, referenceDate }: CalendarViewProps) {
  const { t, language } = useLanguage();
  const sessionRaw = useSyncExternalStore(
    subscribeSessionStore,
    getSessionSnapshot,
    getServerSnapshot
  );

  const sessionState = useMemo(() => {
    return parseSessionSnapshot(sessionRaw);
  }, [sessionRaw]);

  const tours = useMemo(() => {
    return mergeSessionTours(initialTours, sessionState.tours);
  }, [initialTours, sessionState.tours]);

  // Calendar year and month state (1-indexed month: 1 = Jan, 10 = Oct)
  const [refYear, refMonth] = referenceDate.split("-").map(Number);
  const [currentYear, setCurrentYear] = useState<number>(refYear);
  const [currentMonth, setCurrentMonth] = useState<number>(refMonth);
  const [selectedDate, setSelectedDate] = useState<string>(referenceDate);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "arrival" | "departure" | "itinerary">("all");
  const [hideCancelled, setHideCancelled] = useState<boolean>(true);

  // Month navigation helpers
  function handlePrevMonth() {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function handleToday() {
    setCurrentYear(refYear);
    setCurrentMonth(refMonth);
    setSelectedDate(referenceDate);
  }

  // Generate all calendar events from reactive tours
  const allEvents = useMemo(() => {
    const events: CalendarEvent[] = [];

    tours.forEach((tour) => {
      const guide = tour.assignments.find((a) => a.role === "guide")?.name;
      const driver = tour.assignments.find((a) => a.role === "driver")?.name;
      const vehicle = tour.assignments.find((a) => a.role === "vehicle")?.vehicleType;
      const pax = tour.group.adultCount + tour.group.childCount;

      // Inbound flight arrival or scheduled tour arrival
      const arrFlight = tour.flights.find((f) => f.direction === "arrival");
      const arrivalDate = arrFlight?.date || tour.arrivalDate;
      if (arrivalDate) {
        events.push({
          id: `${tour.id}-arr`,
          tourId: tour.id,
          bookingReference: tour.bookingReference,
          groupName: tour.group.groupName,
          date: arrivalDate,
          type: "arrival",
          title: arrFlight
            ? `Arr: ${arrFlight.flightNumber} (${tour.bookingReference})`
            : `Arr: ${tour.bookingReference} (${tour.destination || "Arrival"})`,
          subtext: `${tour.group.groupName} · ${pax} pax${
            arrFlight?.arrivalTime ? ` · Land ${arrFlight.arrivalTime}` : " · Tour Start"
          }`,
          status: tour.status,
          time: arrFlight?.arrivalTime,
          details: {
            flightNumber: arrFlight?.flightNumber,
            terminal: arrFlight?.terminal,
            pax,
            destination: tour.destination,
            guideName: guide,
            driverName: driver,
            vehicleType: vehicle,
          },
        });
      }

      // Outbound flight departure or scheduled tour departure
      const depFlight = tour.flights.find((f) => f.direction === "departure");
      const departureDate = depFlight?.date || tour.departureDate;
      if (departureDate) {
        events.push({
          id: `${tour.id}-dep`,
          tourId: tour.id,
          bookingReference: tour.bookingReference,
          groupName: tour.group.groupName,
          date: departureDate,
          type: "departure",
          title: depFlight
            ? `Dep: ${depFlight.flightNumber} (${tour.bookingReference})`
            : `Dep: ${tour.bookingReference} (${tour.destination || "Departure"})`,
          subtext: `${tour.group.groupName} · ${
            depFlight?.departureTime ? `Outbound ${depFlight.departureTime}` : "Tour End"
          }`,
          status: tour.status,
          time: depFlight?.departureTime,
          details: {
            flightNumber: depFlight?.flightNumber,
            terminal: depFlight?.terminal,
            pax,
            destination: tour.destination,
            guideName: guide,
            driverName: driver,
            vehicleType: vehicle,
          },
        });
      }

      // Daily itinerary entries
      tour.itinerary.forEach((entry, idx) => {
        // Skip entry if it duplicate marks arrival/departure day title
        if (entry.date === tour.arrivalDate && arrFlight) return;
        if (entry.date === tour.departureDate && depFlight) return;

        events.push({
          id: `${tour.id}-itin-${idx}`,
          tourId: tour.id,
          bookingReference: tour.bookingReference,
          groupName: tour.group.groupName,
          date: entry.date,
          type: "itinerary",
          title: `${tour.bookingReference}: ${entry.title.substring(0, 32)}…`,
          subtext: `${tour.group.groupName} · ${entry.location || tour.destination}`,
          status: tour.status,
          details: {
            pax,
            destination: entry.location || tour.destination,
            guideName: guide,
            driverName: driver,
            vehicleType: vehicle,
          },
        });
      });
    });

    return events;
  }, [tours]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (hideCancelled && ev.status === "cancelled") return false;
      if (typeFilter !== "all" && ev.type !== typeFilter) return false;
      return true;
    });
  }, [allEvents, hideCancelled, typeFilter]);

  // Build grid calendar days for currentYear and currentMonth
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
    // Weekday of 1st day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const firstDayIndex = new Date(Date.UTC(currentYear, currentMonth - 1, 1)).getUTCDay();
    // Convert so Monday = 0, Sunday = 6
    const leadingPadding = (firstDayIndex + 6) % 7;

    const days: Array<{
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEvent[];
    }> = [];

    // Leading days from previous month
    const prevMonthDays = new Date(Date.UTC(currentYear, currentMonth - 1, 0)).getUTCDate();
    for (let i = leadingPadding - 1; i >= 0; i--) {
      const pDay = prevMonthDays - i;
      const pMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const pYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const pStr = `${pYear}-${String(pMonth).padStart(2, "0")}-${String(pDay).padStart(2, "0")}`;
      days.push({
        dateString: pStr,
        dayNumber: pDay,
        isCurrentMonth: false,
        isToday: pStr === referenceDate,
        isSelected: pStr === selectedDate,
        events: filteredEvents.filter((e) => e.date === pStr),
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dateString: dStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dStr === referenceDate,
        isSelected: dStr === selectedDate,
        events: filteredEvents.filter((e) => e.date === dStr),
      });
    }

    // Trailing days to complete full 7-day grid weeks (up to 35 or 42 cells)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let t = 1; t <= remaining; t++) {
      const nMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nYear = currentMonth === 12 ? currentYear + 1 : currentYear;
      const nStr = `${nYear}-${String(nMonth).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
      days.push({
        dateString: nStr,
        dayNumber: t,
        isCurrentMonth: false,
        isToday: nStr === referenceDate,
        isSelected: nStr === selectedDate,
        events: filteredEvents.filter((e) => e.date === nStr),
      });
    }

    return days;
  }, [currentYear, currentMonth, referenceDate, selectedDate, filteredEvents]);

  // Selected date events
  const selectedDayEvents = useMemo(() => {
    return filteredEvents.filter((e) => e.date === selectedDate);
  }, [filteredEvents, selectedDate]);

  return (
    <PageContainer>
      {/* Session storage alert */}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Storage Warning:</strong> Could not retrieve saved session modifications ({sessionState.error}). Showing baseline schedule.
          </span>
        </div>
      )}

      {/* ── Calendar Controls Ribbon ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/85 rounded-xl p-3.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors btn-press"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-bold text-[#172d43] hover:text-[#244d70] hover:bg-white rounded transition-colors btn-press"
            >
              {t("cal.today")}
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors btn-press"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              aria-label="Select calendar month"
              className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded px-2 py-1 font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#244d70]"
            >
              {[
                { value: 1, label: language === "ja" ? "1月" : "January" },
                { value: 2, label: language === "ja" ? "2月" : "February" },
                { value: 3, label: language === "ja" ? "3月" : "March" },
                { value: 4, label: language === "ja" ? "4月" : "April" },
                { value: 5, label: language === "ja" ? "5月" : "May" },
                { value: 6, label: language === "ja" ? "6月" : "June" },
                { value: 7, label: language === "ja" ? "7月" : "July" },
                { value: 8, label: language === "ja" ? "8月" : "August" },
                { value: 9, label: language === "ja" ? "9月" : "September" },
                { value: 10, label: language === "ja" ? "10月" : "October" },
                { value: 11, label: language === "ja" ? "11月" : "November" },
                { value: 12, label: language === "ja" ? "12月" : "December" },
              ].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              aria-label="Select calendar year"
              className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded px-2 py-1 font-mono font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#244d70]"
            >
              {[2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016].map((yr) => (
                <option key={yr} value={yr}>
                  {yr}{language === "ja" ? "年" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap max-w-full">
          <div className="flex items-center gap-1 text-xs border border-slate-200 rounded-lg p-1 bg-slate-50 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-semibold transition-colors btn-press",
                typeFilter === "all"
                  ? "bg-white text-[#172d43] shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {t("cal.all_events")}
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("arrival")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors btn-press",
                typeFilter === "arrival"
                  ? "bg-[#244d70] text-white shadow-xs font-bold"
                  : "text-slate-500 hover:text-[#244d70]"
              )}
            >
              <PlaneLanding size={12} />
              {t("cal.arrivals")}
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("departure")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors btn-press",
                typeFilter === "departure"
                  ? "bg-slate-700 text-white shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <PlaneTakeoff size={12} />
              {t("cal.departures")}
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("itinerary")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors btn-press",
                typeFilter === "itinerary"
                  ? "bg-emerald-600 text-white shadow-xs font-bold"
                  : "text-slate-500 hover:text-emerald-700"
              )}
            >
              <Compass size={12} />
              {language === "ja" ? "周遊日程" : "Tours"}
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none pl-1">
            <input
              type="checkbox"
              checked={hideCancelled}
              onChange={(e) => setHideCancelled(e.target.checked)}
              className="rounded border-slate-300 text-[#244d70] focus:ring-[#244d70]"
            />
            <span>{language === "ja" ? "キャンセル非表示" : "Hide Cancelled"}</span>
          </label>
        </div>
      </div>

      {/* ── Main Operational Grid & Day Inspector ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Month Matrix (8 cols on XL) */}
        <div className="xl:col-span-8">
          <Card className="overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/75 text-center text-xs font-bold text-slate-600 py-2">
              {(language === "ja" ? WEEKDAYS_JA : WEEKDAYS).map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 border-b border-slate-200">
              {calendarDays.map((day) => {
                const isSelected = day.dateString === selectedDate;
                return (
                  <button
                    key={day.dateString}
                    type="button"
                    onClick={() => setSelectedDate(day.dateString)}
                    className={cn(
                      "min-h-[92px] p-1.5 flex flex-col text-left transition-colors relative hover:bg-[#dcecf7]/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#244d70]",
                      !day.isCurrentMonth && "bg-slate-50/50 text-slate-400",
                      day.isCurrentMonth && "bg-white",
                      isSelected && "bg-[#dcecf7]/50 ring-2 ring-inset ring-[#244d70] z-10"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full",
                          day.isToday && "bg-[#244d70] text-white font-bold",
                          !day.isToday && day.isCurrentMonth && "text-slate-800",
                          !day.isToday && !day.isCurrentMonth && "text-slate-400"
                        )}
                      >
                        {day.dayNumber}
                      </span>
                      {day.events.length > 0 && (
                        <span className="text-[10px] font-mono text-slate-400 font-medium">
                          {day.events.length}
                        </span>
                      )}
                    </div>

                    {/* Event pills inside day cell */}
                    <div className="space-y-1 w-full flex-1 overflow-hidden">
                      {day.events.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded truncate font-medium border leading-tight",
                            ev.type === "arrival" && "bg-blue-50 text-blue-800 border-blue-200",
                            ev.type === "departure" && "bg-slate-100 text-slate-800 border-slate-200",
                            ev.type === "itinerary" && "bg-emerald-50 text-emerald-800 border-emerald-200",
                            ev.status === "cancelled" && "bg-red-50 text-red-700 border-red-200 line-through opacity-70"
                          )}
                          title={`${ev.title} (${ev.groupName})`}
                        >
                          {ev.type === "arrival" && "🛬 "}
                          {ev.type === "departure" && "🛫 "}
                          {ev.title}
                        </div>
                      ))}
                      {day.events.length > 2 && (
                        <div className="text-[9px] text-slate-500 font-semibold pl-0.5">
                          +{day.events.length - 2} {language === "ja" ? "件" : "more"}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <CardFooter className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" />
                  <span className="text-[11px]">{language === "ja" ? "到着便" : "Arrival Flight"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-300" />
                  <span className="text-[11px]">{language === "ja" ? "出発送迎" : "Departure Transfer"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" />
                  <span className="text-[11px]">{language === "ja" ? "周遊行程" : "Tour Itinerary"}</span>
                </span>
              </div>
              <span className="text-[11px] font-mono">
                {language === "ja" ? "日付をクリックして予定を確認" : "Click any cell to inspect day schedule"}
              </span>
            </CardFooter>
          </Card>
        </div>

        {/* Selected Day Agenda Drawer (4 cols on XL) */}
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader className="bg-slate-50/50 py-3 px-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {language === "ja" ? "日別運行スケジュール" : "Day Schedule"}
                  </h3>
                  <Badge variant={selectedDate === referenceDate ? "info" : "neutral"} className="text-[10px]">
                    {relativeDayLabel(selectedDate, referenceDate)}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {formatDate(selectedDate)}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                {selectedDayEvents.length} {language === "ja" ? "件の発着" : selectedDayEvents.length === 1 ? "movement" : "movements"}
              </span>
            </CardHeader>

            <CardContent className="p-3 space-y-3 max-h-[580px] overflow-y-auto">
              {selectedDayEvents.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <CalendarIcon size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    {language === "ja" ? "この日の発着予定はありません" : "No scheduled movements"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t("cal.no_events")}
                  </p>
                </div>
              ) : (
                selectedDayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {ev.type === "arrival" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                              <PlaneLanding size={11} /> {t("cal.movement_arrival")}
                            </span>
                          )}
                          {ev.type === "departure" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              <PlaneTakeoff size={11} /> {t("cal.movement_departure")}
                            </span>
                          )}
                          {ev.type === "itinerary" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              <Compass size={11} /> {t("cal.movement_circuit")}
                            </span>
                          )}
                          <span className="text-[11px] font-mono font-bold text-slate-800">
                            {ev.bookingReference}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 mt-1 truncate">
                          {ev.groupName}
                        </h4>
                      </div>

                      <Link
                        href={`/tours/${ev.tourId}`}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors shrink-0"
                        title="Open tour details"
                      >
                        <ChevronRightIcon size={16} />
                      </Link>
                    </div>

                    <p className="text-xs text-slate-600 leading-snug">
                      {ev.subtext}
                    </p>

                    {/* Operational resource tags */}
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-[11px] text-slate-500">
                      {ev.details?.destination && (
                        <div className="flex items-center gap-1 truncate">
                          <MapPin size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">{ev.details.destination}</span>
                        </div>
                      )}
                      {ev.details?.pax !== undefined && (
                        <div className="flex items-center gap-1">
                          <Users size={12} className="text-slate-400 shrink-0" />
                          <span>{ev.details.pax} {t("cal.guests_count")}</span>
                        </div>
                      )}
                      {ev.details?.guideName && (
                        <div className="flex items-center gap-1 truncate">
                          <UserCheck size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">{ev.details.guideName}</span>
                        </div>
                      )}
                      {ev.details?.vehicleType && (
                        <div className="flex items-center gap-1 truncate">
                          <Car size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">{ev.details.vehicleType}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
