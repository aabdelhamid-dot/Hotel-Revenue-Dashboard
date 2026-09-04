USE hotel_reservations;
-- To calculate core metrics

with data_updated AS (
	select market_segment_type,
	repeated_guest,
		room_type_reserved,
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
			else 'Dec' end as arrival_month,
		no_of_special_requests,
		lead_time,
		case 
			when lead_time between 0 and 7 then '0-7 days'
			when lead_time between 8 and 30 then '8-30 days'
			when lead_time between 31 and 90 then '31-90 days'
			when lead_time between 91 and 180 then '91-180 days'
			else '180+' end as leadtime_bucket,
		case
			when booking_status = 'Canceled' then 1
			else 0 end as is_Canceled,
		stay_duration,
		avg_price_per_room,
		(avg_price_per_room * stay_duration) as total_booking_amount
	from reservations
)

Select SUM(is_Canceled)*100 / COUNT(*) as cancelation_rate,
	(select AVG(avg_price_per_room)
	from data_updated
	WHERE is_Canceled = 0) as ADR_kept,
	SUM(total_booking_amount)/ SUM(stay_duration) as avg_ADR,
	avg(stay_duration) as avg_length_stay,
	AVG(lead_time) as avg_lead_days,
	SUM(repeated_guest) as repeted_guest_share

FROM data_updated;
