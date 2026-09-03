import pandas as pd, numpy as np
df = pd.read_csv("Hotel Reservations.csv")
df.columns = [c.strip() for c in df.columns]

df['los'] = df['no_of_weekend_nights'] + df['no_of_week_nights']
df['party'] = df['no_of_adults'] + df['no_of_children']
df['booking_value'] = df['avg_price_per_room'] * df['los']   # potential revenue per booking
df['canceled'] = (df['booking_status']=='Canceled').astype(int)
df['realized_value'] = df['booking_value'] * (1-df['canceled'])

N = len(df)
print(f"=== DATASET: {N:,} bookings | years {sorted(df.arrival_year.unique())} ===\n")

print("--- HEADLINE KPIs ---")
print(f"Overall cancellation rate      : {df.canceled.mean()*100:5.1f}%")
print(f"ADR (avg price/room, all)      : {df.avg_price_per_room.mean():6.2f}")
print(f"ADR (kept bookings only)       : {df.loc[df.canceled==0,'avg_price_per_room'].mean():6.2f}")
print(f"Avg length of stay (nights)    : {df.los.mean():5.2f}")
print(f"Avg lead time (days)           : {df.lead_time.mean():6.1f}")
print(f"Avg booking value (price*LOS)  : {df.booking_value.mean():6.2f}")
print(f"Repeat-guest share             : {df.repeated_guest.mean()*100:5.1f}%")
print(f"Parking requested              : {df.required_car_parking_space.mean()*100:5.1f}%")

tot_potential = df.booking_value.sum()
tot_realized  = df.realized_value.sum()
lost = tot_potential - tot_realized
print(f"\n--- REVENUE & LEAKAGE (room-night value, no true inventory available) ---")
print(f"Potential booked value : {tot_potential:14,.0f}")
print(f"Realized value (kept)  : {tot_realized:14,.0f}")
print(f"LOST to cancellations  : {lost:14,.0f}  ({lost/tot_potential*100:.1f}% of potential)")

print("\n--- CANCELLATION BY MARKET SEGMENT (channel mix) ---")
seg = df.groupby('market_segment_type').agg(
    bookings=('Booking_ID','count'),
    cxl_rate=('canceled','mean'),
    adr=('avg_price_per_room','mean'),
    los=('los','mean'),
    lead=('lead_time','mean'),
    lost_value=('booking_value', lambda s: (s*df.loc[s.index,'canceled']).sum())
).sort_values('bookings',ascending=False)
seg['cxl_rate']=(seg['cxl_rate']*100).round(1)
seg['share']=(seg['bookings']/N*100).round(1)
print(seg[['bookings','share','cxl_rate','adr','los','lead','lost_value']].round(1).to_string())

print("\n--- LEAD TIME vs CANCELLATION ---")
df['lead_bucket']=pd.cut(df.lead_time,[-1,7,30,90,180,1000],labels=['0-7d','8-30d','31-90d','91-180d','180d+'])
lt=df.groupby('lead_bucket',observed=True).agg(bookings=('Booking_ID','count'),cxl=('canceled','mean'),adr=('avg_price_per_room','mean'))
lt['cxl']=(lt['cxl']*100).round(1)
print(lt.round(1).to_string())

print("\n--- SEASONALITY (by arrival month, all years) ---")
mo=df.groupby('arrival_month').agg(bookings=('Booking_ID','count'),cxl=('canceled','mean'),adr=('avg_price_per_room','mean'),realized=('realized_value','sum'))
mo['cxl']=(mo['cxl']*100).round(1)
print(mo.round(1).to_string())

print("\n--- ROOM TYPE MIX ---")
rt=df.groupby('room_type_reserved').agg(bookings=('Booking_ID','count'),cxl=('canceled','mean'),adr=('avg_price_per_room','mean'))
rt['cxl']=(rt['cxl']*100).round(1)
rt['share']=(rt['bookings']/N*100).round(1)
print(rt.sort_values('bookings',ascending=False).round(1).to_string())

print("\n--- SPECIAL REQUESTS vs CANCELLATION ---")
sr=df.groupby('no_of_special_requests').agg(bookings=('Booking_ID','count'),cxl=('canceled','mean'),adr=('avg_price_per_room','mean'))
sr['cxl']=(sr['cxl']*100).round(1)
print(sr.round(1).to_string())

print("\n--- REPEAT vs NEW GUEST ---")
rg=df.groupby('repeated_guest').agg(bookings=('Booking_ID','count'),cxl=('canceled','mean'),adr=('avg_price_per_room','mean'))
rg['cxl']=(rg['cxl']*100).round(1)
print(rg.round(1).to_string())

print("\n--- WEEKEND vs WEEKDAY demand ---")
print(f"Total weekend nights : {df.no_of_weekend_nights.sum():,}")
print(f"Total week nights    : {df.no_of_week_nights.sum():,}")
print(f"Avg party size       : {df.party.mean():.2f}")

# --- Export the exact figures the dashboard embeds (metrics.json) ---
import json
metrics = {
    "n_bookings": int(N),
    "years": [int(y) for y in sorted(df.arrival_year.unique())],
    "kpis": {
        "cancellation_rate_pct": round(df.canceled.mean()*100, 1),
        "adr_all": round(df.avg_price_per_room.mean(), 2),
        "adr_kept": round(df.loc[df.canceled==0,'avg_price_per_room'].mean(), 2),
        "avg_los": round(df.los.mean(), 2),
        "avg_lead_time": round(df.lead_time.mean(), 1),
        "repeat_guest_share_pct": round(df.repeated_guest.mean()*100, 1),
        
    },
    "revenue": {
        "potential": round(tot_potential, 0),
        "realized": round(tot_realized, 0),
        "lost": round(lost, 0),
        "lost_pct_of_potential": round(lost/tot_potential*100, 1),
    },
    "segments": seg[['bookings','share','cxl_rate','adr','los','lead','lost_value']].round(1).reset_index().to_dict('records'),
    "lead_time": lt.reset_index().astype(str).to_dict('records'),
    "seasonality": mo.reset_index().round(1).to_dict('records'),
    "room_types": rt.sort_values('bookings',ascending=False).reset_index().round(1).to_dict('records'),
    "special_requests": sr.reset_index().round(1).to_dict('records'),
    "repeat_guest": rg.reset_index().round(1).to_dict('records'),
}
with open("metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)
print("\nWrote metrics.json")
