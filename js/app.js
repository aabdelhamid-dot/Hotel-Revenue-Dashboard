/* Hotel KPI Dashboard — client-side engine.
   Everything runs in the browser: parse CSV, map columns, compute KPIs, render charts.
   No server, no upload of guest data anywhere — the whole point of a standalone tool. */

/* ============================== Field catalog ============================== */

const FIELD_DEFS = [
  { key: 'booking_id',        label: 'Booking ID',                 group: 'Identifiers', aliases: ['booking_id','id','reservation_id','confirmation_number','booking_number'] },
  { key: 'rate',               label: 'Room Rate (ADR source)',     group: 'Revenue',      aliases: ['avg_price_per_room','adr','room_rate','rate','price','avg_daily_rate','average_daily_rate'] },
  { key: 'weekend_nights',    label: 'Weekend Nights',             group: 'Stay',         aliases: ['no_of_weekend_nights','weekend_nights'] },
  { key: 'week_nights',       label: 'Week Nights',                group: 'Stay',         aliases: ['no_of_week_nights','week_nights','weekday_nights'] },
  { key: 'total_nights',      label: 'Total Nights (if not split)',group: 'Stay',         aliases: ['nights','los','length_of_stay','total_nights','no_of_nights'] },
  { key: 'adults',            label: 'Adults',                     group: 'Guests',       aliases: ['no_of_adults','adults'] },
  { key: 'children',          label: 'Children',                   group: 'Guests',       aliases: ['no_of_children','children'] },
  { key: 'status',            label: 'Booking Status',             group: 'Booking',      aliases: ['booking_status','status','reservation_status'] },
  { key: 'lead_time',         label: 'Lead Time (days)',           group: 'Booking',      aliases: ['lead_time','booking_lead_time','days_before_arrival','lead_time_days'] },
  { key: 'arrival_date',      label: 'Arrival Date (full date)',   group: 'Dates',        aliases: ['arrival_date','checkin_date','check_in_date','arrival','date'] },
  { key: 'arrival_year',      label: 'Arrival Year',               group: 'Dates',        aliases: ['arrival_year','year'] },
  { key: 'arrival_month',     label: 'Arrival Month',              group: 'Dates',        aliases: ['arrival_month','month'] },
  { key: 'market_segment',    label: 'Market Segment / Channel',   group: 'Booking',      aliases: ['market_segment_type','market_segment','channel','booking_channel','source','distribution_channel'] },
  { key: 'repeated_guest',    label: 'Repeat Guest Flag',          group: 'Guests',       aliases: ['repeated_guest','is_repeat_guest','repeat_guest','returning_guest'] },
  { key: 'special_requests',  label: 'Special Requests (count)',   group: 'Guests',       aliases: ['no_of_special_requests','special_requests','total_special_requests'] },
  { key: 'room_type',         label: 'Room Type',                  group: 'Room',         aliases: ['room_type_reserved','room_type','room_category'] },
  { key: 'parking',           label: 'Parking Requested',          group: 'Guests',       aliases: ['required_car_parking_space','parking_requested','car_parking'] },
  { key: 'prev_cancellations',label: 'Previous Cancellations',     group: 'Guests',       aliases: ['no_of_previous_cancellations','previous_cancellations'] },
];

function normalizeHeader(h) {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function autoMapColumns(headers) {
  const normalized = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
  const mapping = {};
  for (const field of FIELD_DEFS) {
    const hit = normalized.find(h => field.aliases.includes(h.norm));
    if (hit) mapping[field.key] = hit.raw;
  }
  return mapping;
}

/* ============================== State ============================== */

const STORAGE_KEY = 'hotelkpi.config.v1';

const State = {
  rawRows: [],
  headers: [],
  fileLabel: '',
  mapping: {},
  canceledValues: new Set(),
  statusUniqueValues: [],
  settings: { propertyName: 'My Hotel', totalRooms: '', currency: '$' },
  selectedKpis: new Set(),
  rows: [],            // derived rows
  charts: [],           // live Chart.js instances (destroyed on re-render)
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (cfg.settings) Object.assign(State.settings, cfg.settings);
    if (Array.isArray(cfg.selectedKpis)) State.selectedKpis = new Set(cfg.selectedKpis);
  } catch (e) { /* ignore corrupt config */ }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: State.settings,
      selectedKpis: [...State.selectedKpis],
    }));
  } catch (e) { /* storage unavailable — non-fatal */ }
}

/* ============================== Helpers ============================== */

const num = v => { if (v === undefined || v === null || v === '') return null; const n = parseFloat(v); return isNaN(n) ? null : n; };
const boolish = v => { if (v === undefined || v === null || v === '') return null; const s = String(v).trim().toLowerCase(); return ['1', 'yes', 'y', 'true'].includes(s); };
const mean = arr => arr.length ? sum(arr) / arr.length : null;
const sum = arr => arr.reduce((a, b) => a + b, 0);
const fmtPct = v => v == null ? '—' : v.toFixed(1) + '%';
const fmtNum = (v, d = 1) => v == null ? '—' : v.toFixed(d);
const fmtMoney = (n, cur) => {
  if (n == null) return '—';
  const c = cur || '$';
  return Math.abs(n) >= 1e6 ? c + (n / 1e6).toFixed(2) + 'M' : c + Math.round(n).toLocaleString();
};

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Guards against columns like a bare "arrival_date" day-of-month integer (e.g. "2", "28") being
// misread as a full calendar date — require an actual date separator before trusting Date().
function looksLikeFullDate(v) {
  const s = String(v).trim();
  return s.length >= 6 && /[-\/]/.test(s);
}

/* ============================== Derived rows ============================== */

function buildDerivedRows(rawRows, mapping, canceledValues) {
  const get = (r, field) => mapping[field] ? r[mapping[field]] : undefined;
  return rawRows.map(r => {
    const weekend = num(get(r, 'weekend_nights'));
    const week = num(get(r, 'week_nights'));
    const nights = (weekend !== null || week !== null) ? (weekend || 0) + (week || 0) : num(get(r, 'total_nights'));
    const adults = num(get(r, 'adults'));
    const children = num(get(r, 'children'));
    const rate = num(get(r, 'rate'));
    const statusRaw = get(r, 'status');
    const canceled = statusRaw !== undefined ? canceledValues.has(String(statusRaw).trim()) : null;
    const leadTime = num(get(r, 'lead_time'));
    let month = num(get(r, 'arrival_month'));
    let year = num(get(r, 'arrival_year'));
    let date = null;
    const dateRaw = get(r, 'arrival_date');
    if (dateRaw && looksLikeFullDate(dateRaw)) {
      const d = new Date(dateRaw);
      if (!isNaN(d.getTime())) {
        date = d;
        if (month === null) month = d.getMonth() + 1;
        if (year === null) year = d.getFullYear();
      }
    }
    const marketSegment = get(r, 'market_segment') ?? null;
    const repeat = boolish(get(r, 'repeated_guest'));
    const specialReq = num(get(r, 'special_requests'));
    const roomType = get(r, 'room_type') ?? null;
    const parking = boolish(get(r, 'parking'));
    const prevCancellations = num(get(r, 'prev_cancellations'));
    const value = (rate !== null && nights !== null) ? rate * nights : null;
    return { nights, weekend, week, adults, children, rate, canceled, leadTime, month, year, date, marketSegment, repeat, specialReq, roomType, parking, prevCancellations, value };
  });
}

function computeAvailableRoomNights(rows, mapping, settings) {
  const totalRooms = num(settings.totalRooms);
  if (!(totalRooms > 0)) return null;
  const dated = rows.filter(r => r.date instanceof Date);
  if (mapping.arrival_date && dated.length) {
    const times = dated.map(r => r.date.getTime());
    const days = Math.round((Math.max(...times) - Math.min(...times)) / 86400000) + 1;
    return { roomNights: totalRooms * days, days, granularity: 'daily' };
  }
  const combos = new Set();
  rows.forEach(r => { if (r.month != null) combos.add((r.year != null ? r.year : 'y') + '-' + r.month); });
  if (combos.size) {
    let days = 0;
    combos.forEach(c => {
      const [y, m] = c.split('-');
      const year = y === 'y' ? new Date().getFullYear() : Number(y);
      days += new Date(year, Number(m), 0).getDate();
    });
    return { roomNights: totalRooms * days, days, granularity: 'monthly' };
  }
  return null;
}

/* ============================== KPI catalog ============================== */
/* Each KPI declares what it needs; isAvailable() checks the mapping before compute() runs. */

const KPI_DEFS = [
  // ---- Revenue & Yield ----
  { id: 'total_bookings', category: 'Revenue & Yield', label: 'Total Bookings', blurb: 'Row count in the dataset.', requires: [],
    compute: (ctx) => ({ stat: { label: 'Total Bookings', value: ctx.rows.length.toLocaleString(), sub: `${ctx.mapping.arrival_year || ctx.mapping.arrival_date ? '' : ''}`.trim() || 'all rows loaded' } }) },

  { id: 'adr', category: 'Revenue & Yield', label: 'ADR (Average Daily Rate)', blurb: 'Average room rate, all vs. non-cancelled bookings.', requires: ['rate'],
    compute: (ctx) => {
      const all = ctx.rows.map(r => r.rate).filter(v => v != null);
      const kept = ctx.rows.filter(r => r.canceled !== true).map(r => r.rate).filter(v => v != null);
      if (!all.length) return null;
      return { stat: { label: 'ADR', value: fmtMoney(mean(kept.length ? kept : all), ctx.settings.currency), sub: `all bookings: ${fmtMoney(mean(all), ctx.settings.currency)}` } };
    } },

  { id: 'occupancy_rate', category: 'Revenue & Yield', label: 'Occupancy Rate', blurb: 'Room-nights sold ÷ room-nights available. Needs total room count.', requires: [], needsInventory: true,
    compute: (ctx) => {
      if (!ctx.availability) return null;
      const sold = sum(ctx.rows.filter(r => r.canceled !== true && r.nights != null).map(r => r.nights));
      const occ = sold / ctx.availability.roomNights * 100;
      return { stat: { label: 'Occupancy Rate', value: fmtPct(occ), sub: ctx.availability.granularity === 'monthly' ? 'estimated (monthly granularity)' : 'from date range in data' } };
    } },

  { id: 'revpar', category: 'Revenue & Yield', label: 'RevPAR', blurb: 'Realized room revenue ÷ room-nights available.', requires: ['rate'], needsInventory: true,
    compute: (ctx) => {
      if (!ctx.availability) return null;
      const realized = sum(ctx.rows.filter(r => r.canceled !== true && r.value != null).map(r => r.value));
      const revpar = realized / ctx.availability.roomNights;
      return { stat: { label: 'RevPAR', value: fmtMoney(revpar, ctx.settings.currency), sub: ctx.availability.granularity === 'monthly' ? 'estimated (monthly granularity)' : 'from date range in data' } };
    } },

  { id: 'potential_revenue', category: 'Revenue & Yield', label: 'Potential Room Revenue', blurb: 'Rate × nights, all bookings before cancellations.', requires: ['rate'],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => r.value).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Potential Room Revenue', value: fmtMoney(sum(vals), ctx.settings.currency), sub: 'rate × nights, all bookings' } };
    } },

  { id: 'realized_revenue', category: 'Revenue & Yield', label: 'Realized Room Revenue', blurb: 'Potential revenue minus cancelled bookings.', requires: ['rate', 'status'],
    compute: (ctx) => {
      const vals = ctx.rows.filter(r => r.canceled !== true).map(r => r.value).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Realized Room Revenue', value: fmtMoney(sum(vals), ctx.settings.currency), sub: 'kept bookings only' } };
    } },

  { id: 'revenue_lost', category: 'Revenue & Yield', label: 'Revenue Lost to Cancellations', blurb: 'Potential minus realized revenue.', requires: ['rate', 'status'],
    compute: (ctx) => {
      const potential = sum(ctx.rows.map(r => r.value).filter(v => v != null));
      const realized = sum(ctx.rows.filter(r => r.canceled !== true).map(r => r.value).filter(v => v != null));
      if (!potential) return null;
      const lost = potential - realized;
      return { stat: { label: 'Revenue Lost to Cancellations', value: fmtMoney(lost, ctx.settings.currency), sub: `${(lost / potential * 100).toFixed(1)}% of potential`, cls: 'bad' } };
    } },

  { id: 'revenue_by_room_type', category: 'Revenue & Yield', label: 'Revenue by Room Type', blurb: 'Realized revenue split across room types.', requires: ['rate', 'room_type'],
    compute: (ctx) => {
      const g = groupBy(ctx.rows.filter(r => r.canceled !== true && r.value != null), r => r.roomType);
      if (!g.size) return null;
      const entries = [...g.entries()].map(([k, rs]) => [k, sum(rs.map(r => r.value))]).sort((a, b) => b[1] - a[1]);
      return { chart: { type: 'bar', title: 'Revenue by Room Type', note: 'Realized room revenue, non-cancelled bookings',
        labels: entries.map(e => e[0]), datasets: [{ label: `Revenue (${ctx.settings.currency})`, data: entries.map(e => e[1]) }] } };
    } },

  // ---- Demand & Booking Behavior ----
  { id: 'cancellation_rate', category: 'Demand & Bookings', label: 'Cancellation Rate', blurb: 'Share of bookings marked cancelled.', requires: ['status'],
    compute: (ctx) => {
      const flagged = ctx.rows.filter(r => r.canceled !== null);
      if (!flagged.length) return null;
      const rate = mean(flagged.map(r => r.canceled ? 1 : 0)) * 100;
      return { stat: { label: 'Cancellation Rate', value: fmtPct(rate), sub: `${flagged.filter(r => r.canceled).length.toLocaleString()} of ${flagged.length.toLocaleString()} bookings`, cls: rate >= 30 ? 'bad' : rate >= 15 ? 'warn' : 'good' } };
    } },

  { id: 'avg_los', category: 'Demand & Bookings', label: 'Average Length of Stay', blurb: 'Mean nights per booking.', requires: [],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => r.nights).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Avg. Length of Stay', value: fmtNum(mean(vals)) + ' nights' } };
    } },

  { id: 'avg_lead_time', category: 'Demand & Bookings', label: 'Average Booking Lead Time', blurb: 'Mean days between booking and arrival.', requires: ['lead_time'],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => r.leadTime).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Avg. Lead Time', value: Math.round(mean(vals)) + ' days', sub: 'booking → arrival' } };
    } },

  { id: 'booking_pace', category: 'Demand & Bookings', label: 'Booking Pace (Lead-Time Buckets)', blurb: 'Cancellation rate by how far out the booking was made.', requires: ['lead_time'],
    compute: (ctx) => {
      const buckets = [[0, 7, '0-7d'], [8, 30, '8-30d'], [31, 90, '31-90d'], [91, 180, '91-180d'], [181, Infinity, '180d+']];
      const withLead = ctx.rows.filter(r => r.leadTime != null);
      if (!withLead.length) return null;
      const labels = [], bookings = [], cxl = [];
      for (const [lo, hi, label] of buckets) {
        const rs = withLead.filter(r => r.leadTime >= lo && r.leadTime <= hi);
        if (!rs.length) continue;
        labels.push(label); bookings.push(rs.length);
        const flagged = rs.filter(r => r.canceled !== null);
        cxl.push(flagged.length ? +(mean(flagged.map(r => r.canceled ? 1 : 0)) * 100).toFixed(1) : null);
      }
      return { chart: { type: 'bar', title: 'Booking Pace vs. Cancellation', note: 'Cancellation rate by lead-time bucket',
        labels, datasets: [{ label: 'Cancellation %', data: cxl }], secondary: { label: 'Bookings', data: bookings } } };
    } },

  { id: 'seasonality', category: 'Demand & Bookings', label: 'Seasonality (by Month)', blurb: 'Bookings, ADR and cancellation rate across arrival months.', requires: [], needsMonth: true,
    compute: (ctx) => {
      const withMonth = ctx.rows.filter(r => r.month != null && r.month >= 1 && r.month <= 12);
      if (!withMonth.length) return null;
      const g = groupBy(withMonth, r => r.month);
      const labels = [], bookingsArr = [], adrArr = [], cxlArr = [];
      for (let m = 1; m <= 12; m++) {
        const rs = g.get(m);
        if (!rs) continue;
        labels.push(MONTH_NAMES[m - 1]);
        bookingsArr.push(rs.length);
        const rates = rs.map(r => r.rate).filter(v => v != null);
        adrArr.push(rates.length ? +mean(rates).toFixed(1) : null);
        const flagged = rs.filter(r => r.canceled !== null);
        cxlArr.push(flagged.length ? +(mean(flagged.map(r => r.canceled ? 1 : 0)) * 100).toFixed(1) : null);
      }
      return { chart: { type: 'bar', title: 'Seasonality', note: 'Bookings by month, with ADR and cancellation overlay',
        labels, datasets: [{ label: 'Bookings', data: bookingsArr }], line1: { label: 'ADR', data: adrArr }, line2: { label: 'Cancel %', data: cxlArr } } };
    } },

  { id: 'weekend_mix', category: 'Demand & Bookings', label: 'Weekend vs. Weekday Nights', blurb: 'Split of booked nights between weekend and weekday.', requires: [], needsRawNights: true,
    compute: (ctx) => {
      const weekend = sum(ctx.rows.map(r => r.weekend).filter(v => v != null));
      const week = sum(ctx.rows.map(r => r.week).filter(v => v != null));
      if (!weekend && !week) return null;
      return { chart: { type: 'doughnut', title: 'Weekend vs. Weekday Nights', note: 'Total booked room-nights',
        labels: ['Weekend nights', 'Week nights'], datasets: [{ data: [weekend, week] }] } };
    } },

  // ---- Guest Profile ----
  { id: 'repeat_guest_rate', category: 'Guest Profile', label: 'Repeat Guest Rate', blurb: 'Share of bookings from returning guests.', requires: ['repeated_guest'],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => r.repeat).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Repeat Guest Rate', value: fmtPct(mean(vals.map(v => v ? 1 : 0)) * 100), sub: 'loyalty base size' } };
    } },

  { id: 'avg_special_requests', category: 'Guest Profile', label: 'Avg. Special Requests', blurb: 'Mean special requests per booking — an engagement signal.', requires: ['special_requests'],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => r.specialReq).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Avg. Special Requests', value: fmtNum(mean(vals), 2) } };
    } },

  { id: 'avg_party_size', category: 'Guest Profile', label: 'Average Party Size', blurb: 'Mean adults + children per booking.', requires: ['adults'],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => (r.adults || 0) + (r.children || 0)).filter(v => v > 0);
      if (!vals.length) return null;
      return { stat: { label: 'Avg. Party Size', value: fmtNum(mean(vals), 2) } };
    } },

  { id: 'parking_rate', category: 'Guest Profile', label: 'Parking Request Rate', blurb: 'Share of bookings requesting parking.', requires: ['parking'],
    compute: (ctx) => {
      const vals = ctx.rows.map(r => r.parking).filter(v => v != null);
      if (!vals.length) return null;
      return { stat: { label: 'Parking Request Rate', value: fmtPct(mean(vals.map(v => v ? 1 : 0)) * 100) } };
    } },

  // ---- Channel & Segment ----
  { id: 'segment_mix', category: 'Channel & Segment', label: 'Market Segment Mix', blurb: 'Booking volume by channel / market segment.', requires: ['market_segment'],
    compute: (ctx) => {
      const g = groupBy(ctx.rows, r => r.marketSegment);
      if (!g.size) return null;
      const entries = [...g.entries()].sort((a, b) => b[1].length - a[1].length);
      return { chart: { type: 'doughnut', title: 'Market Segment Mix', note: 'Share of total bookings',
        labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1].length) }] } };
    } },

  { id: 'cancellation_by_segment', category: 'Channel & Segment', label: 'Cancellation Rate by Segment', blurb: 'Which channels leak the most bookings.', requires: ['market_segment', 'status'],
    compute: (ctx) => {
      const g = groupBy(ctx.rows.filter(r => r.canceled !== null), r => r.marketSegment);
      if (!g.size) return null;
      const entries = [...g.entries()].sort((a, b) => b[1].length - a[1].length);
      return { chart: { type: 'bar', title: 'Cancellation Rate by Segment', note: 'Higher = more revenue leakage',
        labels: entries.map(e => e[0]), datasets: [{ label: 'Cancellation %', data: entries.map(e => +(mean(e[1].map(r => r.canceled ? 1 : 0)) * 100).toFixed(1)) }] } };
    } },

  { id: 'adr_by_segment', category: 'Channel & Segment', label: 'ADR by Segment', blurb: 'Average rate achieved per channel.', requires: ['market_segment', 'rate'],
    compute: (ctx) => {
      const g = groupBy(ctx.rows.filter(r => r.rate != null), r => r.marketSegment);
      if (!g.size) return null;
      const entries = [...g.entries()].sort((a, b) => b[1].length - a[1].length);
      return { chart: { type: 'bar', title: 'ADR by Segment', note: 'Average daily rate per channel',
        labels: entries.map(e => e[0]), datasets: [{ label: `ADR (${ctx.settings.currency})`, data: entries.map(e => +mean(e[1].map(r => r.rate)).toFixed(1)) }] } };
    } },

  // ---- Room Type ----
  { id: 'room_type_mix', category: 'Room Type', label: 'Room Type Mix', blurb: 'Booking volume by room type.', requires: ['room_type'],
    compute: (ctx) => {
      const g = groupBy(ctx.rows, r => r.roomType);
      if (!g.size) return null;
      const entries = [...g.entries()].sort((a, b) => b[1].length - a[1].length);
      return { chart: { type: 'doughnut', title: 'Room Type Mix', note: 'Share of total bookings',
        labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1].length) }] } };
    } },

  { id: 'cancellation_by_room_type', category: 'Room Type', label: 'Cancellation Rate by Room Type', blurb: 'Which room types cancel most often.', requires: ['room_type', 'status'],
    compute: (ctx) => {
      const g = groupBy(ctx.rows.filter(r => r.canceled !== null), r => r.roomType);
      if (!g.size) return null;
      const entries = [...g.entries()].sort((a, b) => b[1].length - a[1].length);
      return { chart: { type: 'bar', title: 'Cancellation Rate by Room Type', note: '',
        labels: entries.map(e => e[0]), datasets: [{ label: 'Cancellation %', data: entries.map(e => +(mean(e[1].map(r => r.canceled ? 1 : 0)) * 100).toFixed(1)) }] } };
    } },
];

const KPI_CATEGORIES = ['Revenue & Yield', 'Demand & Bookings', 'Guest Profile', 'Channel & Segment', 'Room Type'];

function kpiIsAvailable(kpi, mapping, settings) {
  for (const f of kpi.requires || []) if (!mapping[f]) return false;
  if (kpi.needsInventory && !(num(settings.totalRooms) > 0)) return false;
  if (kpi.needsRawNights && !(mapping.weekend_nights && mapping.week_nights)) return false;
  if (kpi.needsMonth && !(mapping.arrival_month || mapping.arrival_date)) return false;
  return true;
}

/* ============================== CSV loading ============================== */

function parseCSVText(text, label) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  State.rawRows = result.data;
  State.headers = result.meta.fields || [];
  State.fileLabel = label;
  onDataLoaded();
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => parseCSVText(e.target.result, `${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  reader.readAsText(file);
}

function loadSample() {
  fetch('Hotel Reservations.csv', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(text => parseCSVText(text, 'Sample dataset · INN Hotels (36,275 bookings)'))
    .catch(() => {
      alert('Could not fetch the bundled sample CSV. If you opened this file directly (file://), run a local server, e.g.\n\npython -m http.server 8000\n\nthen reload via http://localhost:8000');
    });
}

function onDataLoaded() {
  State.mapping = autoMapColumns(State.headers);
  document.getElementById('rowCount').textContent = State.rawRows.length.toLocaleString();
  document.getElementById('fileMetaWrap').classList.remove('hidden');
  document.getElementById('fileMetaText').textContent = State.fileLabel;
  goToStep('mapping');
  renderMappingPanel();
}

/* ============================== UI: stepper ============================== */

function goToStep(step) {
  ['upload', 'mapping', 'settings', 'dashboard'].forEach(s => {
    document.getElementById('step-' + s).classList.toggle('hidden', s !== step);
    document.getElementById('pill-' + s).classList.remove('active', 'done');
  });
  const order = ['upload', 'mapping', 'settings', 'dashboard'];
  const idx = order.indexOf(step);
  order.forEach((s, i) => {
    const pill = document.getElementById('pill-' + s);
    if (i < idx) pill.classList.add('done');
    if (i === idx) pill.classList.add('active');
  });
}

/* ============================== UI: mapping ============================== */

function renderMappingPanel() {
  const groups = {};
  FIELD_DEFS.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
  const el = document.getElementById('mapGroups');
  el.innerHTML = Object.entries(groups).map(([group, fields]) => `
    <div class="map-group">
      <h4>${group}</h4>
      ${fields.map(f => `
        <div class="map-row">
          <label for="map-${f.key}">${f.label}</label>
          <select id="map-${f.key}" data-field="${f.key}">
            <option value="">— none —</option>
            ${State.headers.map(h => `<option value="${escapeHtml(h)}" ${State.mapping[f.key] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>`).join('');
  el.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
    State.mapping[sel.dataset.field] = sel.value || undefined;
    if (sel.dataset.field === 'status') renderStatusValues();
  }));
  renderStatusValues();
}

function renderStatusValues() {
  const wrap = document.getElementById('statusValuesWrap');
  const statusCol = State.mapping.status;
  if (!statusCol) { wrap.classList.add('hidden'); return; }
  const unique = [...new Set(State.rawRows.map(r => (r[statusCol] ?? '').toString().trim()).filter(Boolean))];
  State.statusUniqueValues = unique;
  if (!State.canceledValues.size) {
    unique.filter(v => /cancel/i.test(v) && !/\b(not|non|un)\b|^(not|non|un)[\s_-]?/i.test(v)).forEach(v => State.canceledValues.add(v));
  }
  wrap.classList.remove('hidden');
  document.getElementById('statusValues').innerHTML = unique.map(v => `
    <label><input type="checkbox" value="${escapeHtml(v)}" ${State.canceledValues.has(v) ? 'checked' : ''}> ${escapeHtml(v)}</label>
  `).join('');
  document.querySelectorAll('#statusValues input').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) State.canceledValues.add(cb.value); else State.canceledValues.delete(cb.value);
  }));
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ============================== UI: settings ============================== */

function renderSettingsPanel() {
  document.getElementById('propertyName').value = State.settings.propertyName;
  document.getElementById('totalRooms').value = State.settings.totalRooms;
  document.getElementById('currency').value = State.settings.currency;
}

function readSettingsForm() {
  State.settings.propertyName = document.getElementById('propertyName').value || 'My Hotel';
  State.settings.totalRooms = document.getElementById('totalRooms').value;
  State.settings.currency = document.getElementById('currency').value;
}

/* ============================== UI: KPI sidebar ============================== */

function renderKpiPicker() {
  if (State.selectedKpis.size === 0) {
    KPI_DEFS.forEach(k => { if (kpiIsAvailable(k, State.mapping, State.settings)) State.selectedKpis.add(k.id); });
  }
  const el = document.getElementById('kpiGroups');
  el.innerHTML = KPI_CATEGORIES.map(cat => {
    const items = KPI_DEFS.filter(k => k.category === cat);
    return `
    <div class="kpi-group">
      <div class="ghead"><span>${cat}</span><button type="button" data-cat="${cat}" class="toggleCat">toggle all</button></div>
      ${items.map(k => {
        const avail = kpiIsAvailable(k, State.mapping, State.settings);
        const checked = avail && State.selectedKpis.has(k.id);
        return `<div class="kpi-item ${avail ? '' : 'unavailable'}">
          <input type="checkbox" id="kpi-${k.id}" data-id="${k.id}" ${checked ? 'checked' : ''} ${avail ? '' : 'disabled'}>
          <div><label class="name" for="kpi-${k.id}">${k.label}</label><div class="blurb">${k.blurb}</div></div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  el.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) State.selectedKpis.add(cb.dataset.id); else State.selectedKpis.delete(cb.dataset.id);
    persist();
    renderDashboardBody();
  }));
  el.querySelectorAll('.toggleCat').forEach(btn => btn.addEventListener('click', () => {
    const items = KPI_DEFS.filter(k => k.category === btn.dataset.cat && kpiIsAvailable(k, State.mapping, State.settings));
    const allOn = items.every(k => State.selectedKpis.has(k.id));
    items.forEach(k => allOn ? State.selectedKpis.delete(k.id) : State.selectedKpis.add(k.id));
    persist();
    renderKpiPicker();
    renderDashboardBody();
  }));
  document.getElementById('kpiCount').textContent =
    `${State.selectedKpis.size} of ${KPI_DEFS.filter(k => kpiIsAvailable(k, State.mapping, State.settings)).length} available KPIs selected`;
}

/* ============================== Dashboard rendering ============================== */

function buildContext() {
  const rows = buildDerivedRows(State.rawRows, State.mapping, State.canceledValues);
  const availability = computeAvailableRoomNights(rows, State.mapping, State.settings);
  return { rows, mapping: State.mapping, settings: State.settings, availability };
}

const CHART_PALETTE = ['#4f9cf9', '#3fb950', '#e3b341', '#f0883e', '#a371f7', '#f85149', '#6e7681', '#2ec4b6'];
const CHART_TEXT = { txt: '#e6edf3', muted: '#9fb0c0', grid: '#2e3a47' };

function destroyCharts() { State.charts.forEach(c => c.destroy()); State.charts = []; }

function renderDashboardBody() {
  destroyCharts();
  document.getElementById('propNameOut').textContent = State.settings.propertyName;
  document.getElementById('bookingCountOut').textContent = `${State.rawRows.length.toLocaleString()} bookings loaded`;

  const ctx = buildContext();
  const selected = KPI_DEFS.filter(k => State.selectedKpis.has(k.id) && kpiIsAvailable(k, State.mapping, State.settings));

  const container = document.getElementById('dashboardContent');
  if (!selected.length) {
    container.innerHTML = '<div class="empty-state">No KPIs selected. Pick some from the sidebar to build your dashboard.</div>';
    return;
  }

  const statCards = [];
  const chartCards = [];
  for (const kpi of selected) {
    let result;
    try { result = kpi.compute(ctx); } catch (e) { result = null; }
    if (!result) {
      chartCards.push(`<div class="unavailable-card"><strong>${kpi.label}</strong> — not enough data in the mapped columns to compute this.</div>`);
      continue;
    }
    if (result.stat) statCards.push(renderStatCard(result.stat));
    if (result.chart) chartCards.push(renderChartCard(kpi.id, result.chart));
  }

  container.innerHTML = `
    ${statCards.length ? `<div class="section-title">Key Figures</div><div class="cards-grid">${statCards.join('')}</div>` : ''}
    ${chartCards.length ? `<div class="section-title">Charts &amp; Breakdowns</div><div class="charts-grid">${chartCards.join('')}</div>` : ''}
  `;

  // second pass: instantiate charts now that canvases exist in the DOM
  for (const kpi of selected) {
    let result;
    try { result = kpi.compute(ctx); } catch (e) { result = null; }
    if (result && result.chart) instantiateChart(kpi.id, result.chart);
  }
}

function renderStatCard(stat) {
  return `<div class="kpi-card ${stat.cls || ''}">
    <div class="label">${stat.label}</div>
    <div class="val">${stat.value}</div>
    ${stat.sub ? `<div class="sub">${stat.sub}</div>` : ''}
  </div>`;
}

function renderChartCard(id, chart) {
  const full = chart.type === 'bar' && (chart.line1 || chart.secondary);
  return `<div class="chart-card ${full ? 'full' : ''}">
    <h4>${chart.title}</h4>
    ${chart.note ? `<div class="note">${chart.note}</div>` : '<div class="note">&nbsp;</div>'}
    <div class="chartbox"><canvas id="chart-${id}"></canvas></div>
  </div>`;
}

function instantiateChart(id, chart) {
  const canvas = document.getElementById('chart-' + id);
  if (!canvas) return;
  Chart.defaults.color = CHART_TEXT.muted;
  Chart.defaults.font.family = "-apple-system,Segoe UI,Roboto,sans-serif";
  const gridOpt = { grid: { color: CHART_TEXT.grid }, ticks: { color: CHART_TEXT.muted } };

  if (chart.type === 'doughnut') {
    State.charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: { labels: chart.labels, datasets: [{ data: chart.datasets[0].data, backgroundColor: CHART_PALETTE, borderColor: '#1a2129', borderWidth: 2 }] },
      options: { plugins: { legend: { position: 'right', labels: { color: CHART_TEXT.txt } } } },
    }));
    return;
  }

  const datasets = [{ type: 'bar', label: chart.datasets[0].label, data: chart.datasets[0].data, backgroundColor: CHART_PALETTE[0], borderRadius: 6, yAxisID: 'y' }];
  const scales = { y: { ...gridOpt, position: 'left' }, x: gridOpt };

  if (chart.secondary) {
    datasets.push({ type: 'line', label: chart.secondary.label, data: chart.secondary.data, borderColor: CHART_PALETTE[2], backgroundColor: CHART_PALETTE[2], tension: .3, yAxisID: 'y1', pointRadius: 4 });
    scales.y1 = { ...gridOpt, position: 'right', grid: { drawOnChartArea: false } };
  }
  if (chart.line1) {
    datasets.push({ type: 'line', label: chart.line1.label, data: chart.line1.data, borderColor: CHART_PALETTE[2], backgroundColor: CHART_PALETTE[2], tension: .3, yAxisID: 'y1', pointRadius: 3 });
    scales.y1 = { ...gridOpt, position: 'right', grid: { drawOnChartArea: false } };
  }
  if (chart.line2) {
    datasets.push({ type: 'line', label: chart.line2.label, data: chart.line2.data, borderColor: CHART_PALETTE[5], backgroundColor: CHART_PALETTE[5], borderDash: [5, 4], tension: .3, yAxisID: 'y1', pointRadius: 3 });
    scales.y1 = { ...gridOpt, position: 'right', grid: { drawOnChartArea: false } };
  }

  State.charts.push(new Chart(canvas, { data: { labels: chart.labels, datasets }, options: { scales } }));
}

/* ============================== Wiring ============================== */

document.addEventListener('DOMContentLoaded', () => {
  loadPersisted();

  document.getElementById('sampleBtn').addEventListener('click', loadSample);
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
  ['dragover', 'dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.toggle('drag', evt === 'dragover');
    if (evt === 'drop' && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  }));

  document.getElementById('toSettingsBtn').addEventListener('click', () => { goToStep('settings'); renderSettingsPanel(); });
  document.getElementById('backToUploadBtn').addEventListener('click', () => goToStep('upload'));
  document.getElementById('backToMappingBtn').addEventListener('click', () => goToStep('mapping'));
  document.getElementById('buildDashboardBtn').addEventListener('click', () => {
    readSettingsForm();
    persist();
    goToStep('dashboard');
    renderKpiPicker();
    renderDashboardBody();
  });
  document.getElementById('editConfigBtn').addEventListener('click', () => goToStep('mapping'));
  document.getElementById('printBtn').addEventListener('click', () => window.print());

  goToStep('upload');
});
