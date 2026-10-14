import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { DIETARY_HABITS, EDUCATION_LEVELS, MARITAL_STATUSES, PRAYER_FREQUENCIES } from "../../lib/constants";
import type { SeekerSearchQuery } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { NativeSelect } from "../ui/native-select";
import { EMPTY_FILTERS, SORT_LABELS, type DiscoverFilters } from "./filters";

const CITY_PRESETS = ["Cape Town", "Johannesburg", "Durban", "Pretoria", "London", "Birmingham"];
const SORT_OPTIONS = Object.keys(SORT_LABELS) as SeekerSearchQuery["sortBy"][];

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-slate-600">
        {label}
      </Label>
      {children}
    </div>
  );
}

function OptionSelect({
  id,
  value,
  anyLabel,
  options,
  onChange,
}: {
  id: string;
  value: string;
  anyLabel: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </NativeSelect>
  );
}

interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: DiscoverFilters;
  onChange: (filters: DiscoverFilters) => void;
  /** Result count for the current filters, shown on the close button. */
  resultCount: number | null;
  /** Administrators can preview either gender. */
  showGender: boolean;
}

/** Every browse filter in one place. Changes apply as they are made. */
export function FilterSheet({ open, onOpenChange, filters, onChange, resultCount, showGender }: FilterSheetProps) {
  const set = <K extends keyof DiscoverFilters>(key: K, value: DiscoverFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Search &amp; filters</DialogTitle>
          <DialogDescription>
            Members choose what they share. A filter only matches people who have made that detail visible.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="col-span-2">
            <Field label="Keyword" htmlFor="filter-keyword">
              <Input
                id="filter-keyword"
                type="search"
                value={filters.q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="Name, city or profession"
                maxLength={120}
                className="h-9"
              />
            </Field>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="filter-location" className="text-xs font-semibold text-slate-600">
              City or country
            </Label>
            <Input
              id="filter-location"
              value={filters.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Cape Town"
              maxLength={120}
              className="h-9"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CITY_PRESETS.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => set("location", filters.location === city ? "" : city)}
                  aria-pressed={filters.location === city}
                  className={cn(
                    "h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                    filters.location === city
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          <Field label="Age from" htmlFor="filter-min-age">
            <Input
              id="filter-min-age"
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              value={filters.minAge}
              onChange={(e) => set("minAge", e.target.value)}
              placeholder="18"
              className="h-9"
            />
          </Field>
          <Field label="Age to" htmlFor="filter-max-age">
            <Input
              id="filter-max-age"
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              value={filters.maxAge}
              onChange={(e) => set("maxAge", e.target.value)}
              placeholder="99"
              className="h-9"
            />
          </Field>

          <Field label="Prayer" htmlFor="filter-prayer">
            <OptionSelect
              id="filter-prayer"
              value={filters.prayerFrequency}
              anyLabel="Any"
              options={PRAYER_FREQUENCIES}
              onChange={(value) => set("prayerFrequency", value)}
            />
          </Field>
          <Field label="Diet" htmlFor="filter-diet">
            <OptionSelect
              id="filter-diet"
              value={filters.dietaryHabits}
              anyLabel="Any"
              options={DIETARY_HABITS}
              onChange={(value) => set("dietaryHabits", value)}
            />
          </Field>
          <Field label="Marital status" htmlFor="filter-marital">
            <OptionSelect
              id="filter-marital"
              value={filters.maritalStatus}
              anyLabel="Any"
              options={MARITAL_STATUSES}
              onChange={(value) => set("maritalStatus", value)}
            />
          </Field>
          <Field label="Education" htmlFor="filter-education">
            <OptionSelect
              id="filter-education"
              value={filters.education}
              anyLabel="Any"
              options={EDUCATION_LEVELS}
              onChange={(value) => set("education", value)}
            />
          </Field>

          <Field label="Wali involvement" htmlFor="filter-wali">
            <NativeSelect
              id="filter-wali"
              value={filters.waliInvolved}
              onChange={(e) =>
                set("waliInvolved", e.target.value === "true" ? "true" : e.target.value === "false" ? "false" : "")
              }
            >
              <option value="">Everyone</option>
              <option value="true">Wali involved</option>
              <option value="false">Independent seekers</option>
            </NativeSelect>
          </Field>
          <Field label="Order" htmlFor="filter-sort">
            <NativeSelect
              id="filter-sort"
              value={filters.sortBy}
              onChange={(e) => set("sortBy", SORT_OPTIONS.find((option) => option === e.target.value) ?? "recent")}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          {showGender && (
            <div className="col-span-2">
              <Field label="Admin preview" htmlFor="filter-gender">
                <NativeSelect
                  id="filter-gender"
                  value={filters.gender}
                  onChange={(e) =>
                    set("gender", e.target.value === "male" ? "male" : e.target.value === "female" ? "female" : "")
                  }
                >
                  <option value="">Brothers and sisters</option>
                  <option value="male">Brothers only</option>
                  <option value="female">Sisters only</option>
                </NativeSelect>
              </Field>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} className="text-slate-600">
            <RotateCcw /> Reset
          </Button>
          <Button onClick={() => onOpenChange(false)} className="h-9 bg-rose-600 px-4 text-white hover:bg-rose-700">
            {resultCount === null ? "Show results" : `Show ${resultCount} ${resultCount === 1 ? "profile" : "profiles"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
