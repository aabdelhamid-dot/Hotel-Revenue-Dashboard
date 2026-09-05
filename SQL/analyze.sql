USE hotel_reservations;
GO

-- Working dataset (equivalent to df + derived columns in analyze.py)
IF OBJECT_ID('tempdb..#base') IS NOT NULL DROP TABLE #base;

SELECT
	*,
	(no_of_weekend_nights + no_of_week_nights) AS los,
	(avg_price_per_room * (no_of_weekend_nights + no_of_week_nights)) AS booking_value,
	CASE WHEN booking_status = 'Canceled' THEN 1 ELSE 0 END AS is_canceled,
	case 
			when arrival_month = 1 then 'Jan'
			when arrival_month = 2 then 'Feb'
			when arrival_month = 3 then 'Mar'
			when arrival_month = 4 then 'Apr'
			when arrival_month = 5 then 'May'
			when arrival_month = 6 then 'Jun'
			when arrival_month = 7 then 'Jul'
			when arrival_month = 8 then 'Aug'
			when arrival_month = 9 then 'Sep'
			when arrival_month = 10 then 'Oct'
			when arrival_month = 11 then 'Nov'
			else 'Dec' end as ArrivalMonth,
		case 
			when lead_time between 0 and 7 then '0-7 days'
			when lead_time between 8 and 30 then '8-30 days'
			when lead_time between 31 and 90 then '31-90 days'
			when lead_time between 91 and 180 then '91-180 days'
			else '180+' end as leadtime_bucket	
INTO #base
FROM reservations;
GO

-- === DATASET ===
SELECT
	COUNT(*) AS n_bookings,
	MIN(arrival_year) AS from_year,
	MAX(arrival_year) AS to_year
FROM #base;

-- --- HEADLINE KPIs ---
SELECT
	ROUND(CAST(SUM(is_canceled) AS FLOAT) * 100 / COUNT(*), 1)			AS cancellation_rate_pct,
	ROUND(AVG(avg_price_per_room), 2)									AS adr_all,
	ROUND((SELECT AVG(avg_price_per_room) FROM #base WHERE 	is_canceled = 0), 2) AS adr_kept,
	ROUND(AVG(CAST(los AS FLOAT)), 2)									AS avg_los,
	ROUND(AVG(CAST(lead_time AS FLOAT)), 1)							AS avg_lead_time,
	ROUND(AVG(CAST(repeated_guest AS FLOAT))*100, 1)							AS repeat_guest_share_pct,
	ROUND((select sum(booking_value) from #base where is_canceled = 1),0) AS lost_revenue,
	ROUND((select sum(booking_value) from #base where is_canceled = 1) *100/  sum(booking_value) ,0) AS lost_revenue_pct
FROM #base;

-- --- LEAD TIME vs CANCELLATION ---
SELECT
	leadtime_bucket,
	ROUND(CAST(SUM(is_canceled) AS FLOAT) * 100 / COUNT(*), 1) AS cxl

FROM #base
group by leadtime_bucket;

-- --- SEASONALITY (by arrival month, all years) ---
SELECT
	arrival_month,
	ROUND(CAST(SUM(is_canceled) AS FLOAT) * 100 / COUNT(*), 1) AS cxl_rate,
	ROUND(AVG(avg_price_per_room), 1) AS adr,
	SUM(booking_value * (1 - is_canceled)) AS realized_revenue
FROM #base
GROUP BY arrival_month
ORDER BY arrival_month;

-- --- ROOM TYPE MIX ---
SELECT
	room_type_reserved,
	count(*) as bookings
FROM #base
GROUP BY room_type_reserved
order by bookings desc;


