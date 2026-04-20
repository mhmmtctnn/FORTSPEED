import React, { useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { List, Plus, Pencil, Trash2, Check, X, MapPin, Tag, Upload, Download, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { CityRow, MissionTag, hasAnyData } from '../types';
import { useTags, useMissions } from '../hooks/useQueries';
import { renderTagIcon } from './TagsManager';

// ── Geo Data: Kıta → Ülke listesi ───────────────────────────────────────────
const GEO_DATA: Record<string, string[]> = {
  'AVRUPA': [
    'ALMANYA','ARNAVUTLUK','AVUSTURYA','BELARUS','BELCIKA','BOSNA HERSEK',
    'BRITANYA','BULGARISTAN','CEK CUMHURIYETI','DANIMARKA','ESTONYA',
    'FINLANDIYA','FRANSA','HIRVATISTAN','HOLLANDA','INGILTERE','IRLANDA',
    'ISPANYA','ITALYA','KARADAG','KOSOVA','KUZEY MAKEDONYA','LETONYA',
    'LITVANYA','LUKSEMBURG','MACARISTAN','MALTA','MOLDOVA','NORVEC',
    'POLONYA','PORTEKIZ','ROMANYA','RUSYA','SIRBISTAN','SLOVAKYA',
    'SLOVENYA','ISVEC','ISVICRE','TURKIYE','UKRAYNA','VATIKAN','YUNANISTAN',
  ],
  'ASYA': [
    'AFGANISTAN','AZERBAYCAN','BAHREYN','BANGLADES','BIRLESIK ARAP EMIRLIKLERI',
    'BRUNEI','CIN HALK CUMHURIYETI','ENDONEZYA','FILIPINLER','FILISTIN',
    'GURCISTAN','HINDISTAN','IRAK','IRAN','ISRAIL','JAPONYA','KAMBOCYA',
    'KATAR','KAZAKISTAN','KIRGIZISTAN','KKTC','KUVEYT','LAOS','MALEZYA',
    'MOGOLISTAN','MYANMAR','OZBEKISTAN','PAKISTAN','RUSYA','SINGAPUR',
    'SRI LANKA','SUUDI ARABISTAN','SURIYE','TACIKISTAN','TAYLAND','TAYVAN',
    'TURKMENISTAN','UMMAN','URDUN','VIETNAM','GUNEY KORE',
  ],
  'KUZEY AMERIKA': [
    'AMERIKA BIRLESIK DEVLETLERI','DOMINIK','GUATEMALA','KANADA',
    'KOSTA RIKA','KUBA','MEKSIKA','PANAMA',
  ],
  'GUNEY AMERIKA': [
    'ARJANTIN','BOLIVYA','BREZILYA','EKVATOR','KOLOMBIYA',
    'PARAGUAY','PERU','SILI','VENEZUELLA',
  ],
  'AFRIKA': [
    'ANGOLA','BENIN','BOTSVANA','BURUNDI','CAD','CEZAYIR','CIBUTI',
    'DEMOKRATIK KONGO CUMHURIYETI','ERITRE','ETIYOPYA','FAS','FILDISI',
    'GABON','GAMBIYA','GANA','GINE','GUNEY AFRIKA','GUNEY SUDAN CUMHURIYETI',
    'KAMERUN','KENYA','KONGO','LIBYA','MADAGASKAR','MALI','MISIR',
    'MOZAMBIK','NAMIBYA','NIGER CUMHURIYETI','NIJERYA','RUANDA','SENEGAL',
    'SIERRA LEONE','SOMALI','SUDAN','TANZANYA','TOGO','TUNUS','UGANDA',
    'ZAMBIYA','ZIMBABVE',
  ],
  'AVUSTRALYA': ['AVUSTRALYA','YENİ ZELANDA'],
};

const ALL_COUNTRIES = Array.from(new Set(Object.values(GEO_DATA).flat())).sort();

// ── Ülke merkez koordinatları (ülke seçilince otomatik dolar) ───────────────
interface GeoCoord { lat: number; lon: number; }
const COUNTRY_COORDS: Record<string, GeoCoord> = {
  'ALMANYA': { lat: 51.1657, lon: 10.4515 }, 'FRANSA': { lat: 46.2276, lon: 2.2137 },
  'ITALYA': { lat: 41.8719, lon: 12.5674 }, 'ISPANYA': { lat: 40.4637, lon: -3.7492 },
  'PORTEKIZ': { lat: 39.3999, lon: -8.2245 }, 'INGILTERE': { lat: 55.3781, lon: -3.4360 },
  'BRITANYA': { lat: 55.3781, lon: -3.4360 }, 'HOLLANDA': { lat: 52.1326, lon: 5.2913 },
  'BELCIKA': { lat: 50.5039, lon: 4.4699 }, 'ISVICRE': { lat: 46.8182, lon: 8.2275 },
  'AVUSTURYA': { lat: 47.5162, lon: 14.5501 }, 'POLONYA': { lat: 51.9194, lon: 19.1451 },
  'ROMANYA': { lat: 45.9432, lon: 24.9668 }, 'MACARISTAN': { lat: 47.1625, lon: 19.5033 },
  'CEK CUMHURIYETI': { lat: 49.8175, lon: 15.4730 }, 'SLOVAKYA': { lat: 48.6690, lon: 19.6990 },
  'HIRVATISTAN': { lat: 45.1000, lon: 15.2000 }, 'SIRBISTAN': { lat: 44.0165, lon: 21.0059 },
  'YUNANISTAN': { lat: 39.0742, lon: 21.8243 }, 'BULGARISTAN': { lat: 42.7339, lon: 25.4858 },
  'UKRAYNA': { lat: 48.3794, lon: 31.1656 }, 'RUSYA': { lat: 61.5240, lon: 105.3188 },
  'NORVEÇ': { lat: 60.4720, lon: 8.4689 }, 'NORVEC': { lat: 60.4720, lon: 8.4689 },
  'ISVEC': { lat: 60.1282, lon: 18.6435 }, 'FINLANDIYA': { lat: 61.9241, lon: 25.7482 },
  'DANIMARKA': { lat: 56.2639, lon: 9.5018 }, 'IRLANDA': { lat: 53.1424, lon: -7.6921 },
  'TURKIYE': { lat: 38.9637, lon: 35.2433 }, 'ARNAVUTLUK': { lat: 41.1533, lon: 20.1683 },
  'BOSNA HERSEK': { lat: 43.9159, lon: 17.6791 }, 'KOSOVA': { lat: 42.6026, lon: 20.9030 },
  'KARADAG': { lat: 42.7087, lon: 19.3744 }, 'KUZEY MAKEDONYA': { lat: 41.6086, lon: 21.7453 },
  'SLOVENYA': { lat: 46.1512, lon: 14.9955 }, 'LETONYA': { lat: 56.8796, lon: 24.6032 },
  'LITVANYA': { lat: 55.1694, lon: 23.8813 }, 'ESTONYA': { lat: 58.5953, lon: 25.0136 },
  'MOLDOVA': { lat: 47.4116, lon: 28.3699 }, 'BELARUS': { lat: 53.7098, lon: 27.9534 },
  'LUKSEMBURG': { lat: 49.8153, lon: 6.1296 }, 'MALTA': { lat: 35.9375, lon: 14.3754 },
  // ASYA
  'TURKMENISTAN': { lat: 38.9697, lon: 59.5563 }, 'OZBEKISTAN': { lat: 41.3775, lon: 64.5853 },
  'KAZAKISTAN': { lat: 48.0196, lon: 66.9237 }, 'KIRGIZISTAN': { lat: 41.2044, lon: 74.7661 },
  'TACIKISTAN': { lat: 38.8610, lon: 71.2761 }, 'AZERBAYCAN': { lat: 40.1431, lon: 47.5769 },
  'GURCISTAN': { lat: 42.3154, lon: 43.3569 }, 'IRAN': { lat: 32.4279, lon: 53.6880 },
  'IRAK': { lat: 33.2232, lon: 43.6793 }, 'SUUDI ARABISTAN': { lat: 23.8859, lon: 45.0792 },
  'BIRLESIK ARAP EMIRLIKLERI': { lat: 23.4241, lon: 53.8478 }, 'KATAR': { lat: 25.3548, lon: 51.1839 },
  'KUVEYT': { lat: 29.3117, lon: 47.4818 }, 'BAHREYN': { lat: 26.0667, lon: 50.5577 },
  'URDUN': { lat: 30.5852, lon: 36.2384 }, 'ISRAIL': { lat: 31.0461, lon: 34.8516 },
  'FILISTIN': { lat: 31.9522, lon: 35.2332 }, 'SURIYE': { lat: 34.8021, lon: 38.9968 },
  'LÜBNAN': { lat: 33.8547, lon: 35.8623 }, 'UMMAN': { lat: 21.5126, lon: 55.9233 },
  'HINDISTAN': { lat: 20.5937, lon: 78.9629 }, 'PAKISTAN': { lat: 30.3753, lon: 69.3451 },
  'BANGLADES': { lat: 23.6850, lon: 90.3563 }, 'SRI LANKA': { lat: 7.8731, lon: 80.7718 },
  'AFGANISTAN': { lat: 33.9391, lon: 67.7100 }, 'CIN HALK CUMHURIYETI': { lat: 35.8617, lon: 104.1954 },
  'JAPONYA': { lat: 36.2048, lon: 138.2529 }, 'GUNEY KORE': { lat: 35.9078, lon: 127.7669 },
  'TAYVAN': { lat: 23.6978, lon: 120.9605 }, 'MOGOLISTAN': { lat: 46.8625, lon: 103.8467 },
  'VIETNAM': { lat: 14.0583, lon: 108.2772 }, 'TAYLAND': { lat: 15.8700, lon: 100.9925 },
  'KAMBOCYA': { lat: 12.5657, lon: 104.9910 }, 'LAOS': { lat: 19.8563, lon: 102.4955 },
  'MYANMAR': { lat: 21.9162, lon: 95.9560 }, 'MALEZYA': { lat: 4.2105, lon: 101.9758 },
  'ENDONEZYA': { lat: -0.7893, lon: 113.9213 }, 'FILIPINLER': { lat: 12.8797, lon: 121.7740 },
  'SINGAPUR': { lat: 1.3521, lon: 103.8198 }, 'BRUNEI': { lat: 4.5353, lon: 114.7277 },
  'KKTC': { lat: 35.1264, lon: 33.4299 },
  // KUZEY AMERIKA
  'AMERIKA BIRLESIK DEVLETLERI': { lat: 37.0902, lon: -95.7129 },
  'KANADA': { lat: 56.1304, lon: -106.3468 }, 'MEKSIKA': { lat: 23.6345, lon: -102.5528 },
  'GUATEMALA': { lat: 15.7835, lon: -90.2308 }, 'KUBA': { lat: 21.5218, lon: -77.7812 },
  'DOMINIK': { lat: 18.7357, lon: -70.1627 }, 'KOSTA RIKA': { lat: 9.7489, lon: -83.7534 },
  'PANAMA': { lat: 8.5380, lon: -80.7821 },
  // GUNEY AMERIKA
  'BREZILYA': { lat: -14.2350, lon: -51.9253 }, 'ARJANTIN': { lat: -38.4161, lon: -63.6167 },
  'KOLOMBIYA': { lat: 4.5709, lon: -74.2973 }, 'PERU': { lat: -9.1900, lon: -75.0152 },
  'VENEZUELLA': { lat: 6.4238, lon: -66.5897 }, 'SILI': { lat: -35.6751, lon: -71.5430 },
  'EKVATOR': { lat: -1.8312, lon: -78.1834 }, 'BOLIVYA': { lat: -16.2902, lon: -63.5887 },
  'PARAGUAY': { lat: -23.4425, lon: -58.4438 },
  // AFRIKA
  'MISIR': { lat: 26.8206, lon: 30.8025 }, 'NIJERYA': { lat: 9.0820, lon: 8.6753 },
  'GUNEY AFRIKA': { lat: -30.5595, lon: 22.9375 }, 'KENYA': { lat: -0.0236, lon: 37.9062 },
  'ETIYOPYA': { lat: 9.1450, lon: 40.4897 }, 'TANZANYA': { lat: -6.3690, lon: 34.8888 },
  'GANA': { lat: 7.9465, lon: -1.0232 }, 'KAMERUN': { lat: 3.8480, lon: 11.5021 },
  'CEZAYIR': { lat: 28.0339, lon: 1.6596 }, 'TUNUS': { lat: 33.8869, lon: 9.5375 },
  'FAS': { lat: 31.7917, lon: -7.0926 }, 'LIBYA': { lat: 26.3351, lon: 17.2283 },
  'ANGOLA': { lat: -11.2027, lon: 17.8739 }, 'ZIMBABVE': { lat: -19.0154, lon: 29.1549 },
  'MOZAMBIK': { lat: -18.6657, lon: 35.5296 }, 'UGANDA': { lat: 1.3733, lon: 32.2903 },
  'SUDAN': { lat: 12.8628, lon: 30.2176 }, 'MALI': { lat: 17.5707, lon: -3.9962 },
  'SENEGAL': { lat: 14.4974, lon: -14.4524 }, 'SOMALI': { lat: 5.1521, lon: 46.1996 },
  'RUANDA': { lat: -1.9403, lon: 29.8739 }, 'KONGO': { lat: -0.2280, lon: 15.8277 },
  'DEMOKRATIK KONGO CUMHURIYETI': { lat: -4.0383, lon: 21.7587 }, 'MADAGASKAR': { lat: -18.7669, lon: 46.8691 },
  'NAMIBYA': { lat: -22.9576, lon: 18.4904 }, 'BOTSVANA': { lat: -22.3285, lon: 24.6849 },
  'ZAMBIYA': { lat: -13.1339, lon: 27.8493 }, 'GUNEY SUDAN CUMHURIYETI': { lat: 6.8770, lon: 31.3070 },
  'FILDISI': { lat: 7.5400, lon: -5.5471 }, 'BURUNDI': { lat: -3.3731, lon: 29.9189 },
  'TOGO': { lat: 8.6195, lon: 0.8248 }, 'BENIN': { lat: 9.3077, lon: 2.3158 },
  'NIGER CUMHURIYETI': { lat: 17.6078, lon: 8.0817 }, 'CAD': { lat: 15.4542, lon: 18.7322 },
  'CIBUTI': { lat: 11.8251, lon: 42.5903 }, 'GABON': { lat: -0.8037, lon: 11.6094 },
  'SIERRA LEONE': { lat: 8.4606, lon: -11.7799 }, 'GAMBIYA': { lat: 13.4432, lon: -15.3101 },
  'GINE': { lat: 9.9456, lon: -11.2784 },
  // AVUSTRALYA
  'AVUSTRALYA': { lat: -25.2744, lon: 133.7751 }, 'YENİ ZELANDA': { lat: -40.9006, lon: 174.8860 },
};

// ── Ülke → Şehir listesi (cascading dropdown için) ──────────────────────────
const COUNTRY_CITIES: Record<string, Array<{ name: string; lat: number; lon: number }>> = {
  'TURKIYE': [
    { name: 'Ankara', lat: 39.9334, lon: 32.8597 }, { name: 'İstanbul', lat: 41.0082, lon: 28.9784 },
    { name: 'İzmir', lat: 38.4192, lon: 27.1287 }, { name: 'Bursa', lat: 40.1885, lon: 29.0610 },
    { name: 'Antalya', lat: 36.8969, lon: 30.7133 }, { name: 'Adana', lat: 37.0000, lon: 35.3213 },
    { name: 'Gaziantep', lat: 37.0662, lon: 37.3833 }, { name: 'Konya', lat: 37.8746, lon: 32.4932 },
    { name: 'Mersin', lat: 36.7987, lon: 34.6210 }, { name: 'Kayseri', lat: 38.7312, lon: 35.4787 },
    { name: 'Diyarbakır', lat: 37.9144, lon: 40.2306 }, { name: 'Samsun', lat: 41.2928, lon: 36.3313 },
    { name: 'Trabzon', lat: 41.0027, lon: 39.7168 }, { name: 'Erzurum', lat: 39.9043, lon: 41.2679 },
    { name: 'Şanlıurfa', lat: 37.1591, lon: 38.7969 }, { name: 'Van', lat: 38.4891, lon: 43.4089 },
  ],
  'FRANSA': [
    { name: 'Paris', lat: 48.8566, lon: 2.3522 }, { name: 'Lyon', lat: 45.7640, lon: 4.8357 },
    { name: 'Marsilya', lat: 43.2965, lon: 5.3698 }, { name: 'Toulouse', lat: 43.6047, lon: 1.4442 },
    { name: 'Nice', lat: 43.7102, lon: 7.2620 }, { name: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  ],
  'ALMANYA': [
    { name: 'Berlin', lat: 52.5200, lon: 13.4050 }, { name: 'Hamburg', lat: 53.5753, lon: 10.0153 },
    { name: 'Münih', lat: 48.1351, lon: 11.5820 }, { name: 'Köln', lat: 50.9333, lon: 6.9500 },
    { name: 'Frankfurt', lat: 50.1109, lon: 8.6821 }, { name: 'Stuttgart', lat: 48.7758, lon: 9.1829 },
  ],
  'INGILTERE': [
    { name: 'Londra', lat: 51.5074, lon: -0.1278 }, { name: 'Manchester', lat: 53.4808, lon: -2.2426 },
    { name: 'Birmingham', lat: 52.4862, lon: -1.8904 }, { name: 'Edinburgh', lat: 55.9533, lon: -3.1883 },
    { name: 'Leeds', lat: 53.8008, lon: -1.5491 },
  ],
  'BRITANNYA': [
    { name: 'Londra', lat: 51.5074, lon: -0.1278 }, { name: 'Manchester', lat: 53.4808, lon: -2.2426 },
    { name: 'Birmingham', lat: 52.4862, lon: -1.8904 },
  ],
  'ISPANYA': [
    { name: 'Madrid', lat: 40.4168, lon: -3.7038 }, { name: 'Barselona', lat: 41.3851, lon: 2.1734 },
    { name: 'Sevilla', lat: 37.3891, lon: -5.9845 }, { name: 'Valencia', lat: 39.4699, lon: -0.3763 },
    { name: 'Bilbao', lat: 43.2627, lon: -2.9253 },
  ],
  'ITALYA': [
    { name: 'Roma', lat: 41.9028, lon: 12.4964 }, { name: 'Milano', lat: 45.4654, lon: 9.1859 },
    { name: 'Napoli', lat: 40.8518, lon: 14.2681 }, { name: 'Torino', lat: 45.0703, lon: 7.6869 },
    { name: 'Floransa', lat: 43.7696, lon: 11.2558 }, { name: 'Venedik', lat: 45.4408, lon: 12.3155 },
  ],
  'HOLLANDA': [
    { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 }, { name: 'Rotterdam', lat: 51.9225, lon: 4.4792 },
    { name: 'Lahey', lat: 52.0705, lon: 4.3007 }, { name: 'Utrecht', lat: 52.0907, lon: 5.1214 },
  ],
  'POLONYA': [
    { name: 'Varşova', lat: 52.2297, lon: 21.0122 }, { name: 'Krakow', lat: 50.0647, lon: 19.9450 },
    { name: 'Gdansk', lat: 54.3520, lon: 18.6466 }, { name: 'Wroclaw', lat: 51.1079, lon: 17.0385 },
  ],
  'ROMANYA': [
    { name: 'Bükreş', lat: 44.4268, lon: 26.1025 }, { name: 'Cluj-Napoca', lat: 46.7712, lon: 23.6236 },
    { name: 'Constanța', lat: 44.1598, lon: 28.6348 },
  ],
  'RUSYA': [
    { name: 'Moskova', lat: 55.7558, lon: 37.6173 }, { name: 'St. Petersburg', lat: 59.9343, lon: 30.3351 },
    { name: 'Novosibirsk', lat: 54.9885, lon: 82.9207 }, { name: 'Yekaterinburg', lat: 56.8431, lon: 60.6454 },
  ],
  'UKRAYNA': [
    { name: 'Kyiv', lat: 50.4501, lon: 30.5234 }, { name: 'Harkiv', lat: 49.9935, lon: 36.2304 },
    { name: 'Odessa', lat: 46.4825, lon: 30.7233 }, { name: 'Lviv', lat: 49.8397, lon: 24.0297 },
  ],
  'MISIR': [
    { name: 'Kahire', lat: 30.0444, lon: 31.2357 }, { name: 'İskenderiye', lat: 31.2001, lon: 29.9187 },
    { name: 'Gize', lat: 30.0131, lon: 31.2089 },
  ],
  'NIJERYA': [
    { name: 'Lagos', lat: 6.5244, lon: 3.3792 }, { name: 'Abuja', lat: 9.0765, lon: 7.3986 },
    { name: 'Kano', lat: 12.0022, lon: 8.5920 }, { name: 'Ibadan', lat: 7.3775, lon: 3.9470 },
  ],
  'GUNEY AFRIKA': [
    { name: 'Johannesburg', lat: -26.2041, lon: 28.0473 }, { name: 'Cape Town', lat: -33.9249, lon: 18.4241 },
    { name: 'Durban', lat: -29.8587, lon: 31.0218 }, { name: 'Pretoria', lat: -25.7479, lon: 28.2293 },
  ],
  'KENYA': [
    { name: 'Nairobi', lat: -1.2921, lon: 36.8219 }, { name: 'Mombasa', lat: -4.0435, lon: 39.6682 },
  ],
  'HINDISTAN': [
    { name: 'Yeni Delhi', lat: 28.6139, lon: 77.2090 }, { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
    { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 }, { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
    { name: 'Chennai', lat: 13.0827, lon: 80.2707 }, { name: 'Hiderabad', lat: 17.3850, lon: 78.4867 },
  ],
  'CIN HALK CUMHURIYETI': [
    { name: 'Pekin', lat: 39.9042, lon: 116.4074 }, { name: 'Şangay', lat: 31.2304, lon: 121.4737 },
    { name: 'Guangzhou', lat: 23.1291, lon: 113.2644 }, { name: 'Shenzhen', lat: 22.5431, lon: 114.0579 },
    { name: 'Chengdu', lat: 30.5728, lon: 104.0668 },
  ],
  'JAPONYA': [
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 }, { name: 'Osaka', lat: 34.6937, lon: 135.5023 },
    { name: 'Kyoto', lat: 35.0116, lon: 135.7681 }, { name: 'Nagoya', lat: 35.1815, lon: 136.9066 },
    { name: 'Sapporo', lat: 43.0618, lon: 141.3545 },
  ],
  'SUUDI ARABISTAN': [
    { name: 'Riyad', lat: 24.7136, lon: 46.6753 }, { name: 'Cidde', lat: 21.4858, lon: 39.1925 },
    { name: 'Mekke', lat: 21.3891, lon: 39.8579 }, { name: 'Medine', lat: 24.5247, lon: 39.5692 },
  ],
  'BIRLESIK ARAP EMIRLIKLERI': [
    { name: 'Dubai', lat: 25.2048, lon: 55.2708 }, { name: 'Abu Dabi', lat: 24.4539, lon: 54.3773 },
    { name: 'Şarjah', lat: 25.3462, lon: 55.4210 },
  ],
  'IRAK': [
    { name: 'Bağdat', lat: 33.3152, lon: 44.3661 }, { name: 'Erbil', lat: 36.1901, lon: 44.0091 },
    { name: 'Basra', lat: 30.5085, lon: 47.7836 },
  ],
  'IRAN': [
    { name: 'Tahran', lat: 35.6892, lon: 51.3890 }, { name: 'Meşhed', lat: 36.2605, lon: 59.6168 },
    { name: 'İsfahan', lat: 32.6539, lon: 51.6660 }, { name: 'Tebriz', lat: 38.0958, lon: 46.2919 },
  ],
  'AZERBAYCAN': [
    { name: 'Bakü', lat: 40.4093, lon: 49.8671 }, { name: 'Gence', lat: 40.6828, lon: 46.3606 },
  ],
  'Amerika BIRLESIK DEVLETLERI': [
    { name: 'Washington D.C.', lat: 38.9072, lon: -77.0369 }, { name: 'New York', lat: 40.7128, lon: -74.0060 },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 }, { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
    { name: 'Houston', lat: 29.7604, lon: -95.3698 }, { name: 'Miami', lat: 25.7617, lon: -80.1918 },
    { name: 'San Francisco', lat: 37.7749, lon: -122.4194 }, { name: 'Seattle', lat: 47.6062, lon: -122.3321 },
  ],
  'KANADA': [
    { name: 'Ottawa', lat: 45.4215, lon: -75.6972 }, { name: 'Toronto', lat: 43.6510, lon: -79.3470 },
    { name: 'Vancouver', lat: 49.2827, lon: -123.1207 }, { name: 'Montreal', lat: 45.5017, lon: -73.5673 },
  ],
  'MEKSIKA': [
    { name: 'Mexico City', lat: 19.4326, lon: -99.1332 }, { name: 'Guadalajara', lat: 20.6597, lon: -103.3496 },
    { name: 'Monterrey', lat: 25.6866, lon: -100.3161 },
  ],
  'BREZILYA': [
    { name: 'Brasília', lat: -15.7942, lon: -47.8822 }, { name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
    { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 }, { name: 'Salvador', lat: -12.9714, lon: -38.5014 },
  ],
  'ARJANTIN': [
    { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 }, { name: 'Córdoba', lat: -31.4201, lon: -64.1888 },
    { name: 'Rosario', lat: -32.9468, lon: -60.6393 },
  ],
  'KOLOMBIYA': [
    { name: 'Bogota', lat: 4.7110, lon: -74.0721 }, { name: 'Medellín', lat: 6.2476, lon: -75.5658 },
    { name: 'Cali', lat: 3.4516, lon: -76.5320 },
  ],
  'AVUSTRALYA': [
    { name: 'Canberra', lat: -35.2809, lon: 149.1300 }, { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
    { name: 'Melbourne', lat: -37.8136, lon: 144.9631 }, { name: 'Brisbane', lat: -27.4698, lon: 153.0251 },
    { name: 'Perth', lat: -31.9505, lon: 115.8605 },
  ],
  'YENİ ZELANDA': [
    { name: 'Wellington', lat: -41.2865, lon: 174.7762 }, { name: 'Auckland', lat: -36.8509, lon: 174.7645 },
  ],
  'ISRAIL': [
    { name: 'Kudüs', lat: 31.7683, lon: 35.2137 }, { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818 },
    { name: 'Hayfa', lat: 32.7940, lon: 34.9896 },
  ],
  'KATAR': [
    { name: 'Doha', lat: 25.2854, lon: 51.5310 },
  ],
  'GURCISTAN': [
    { name: 'Tiflis', lat: 41.6938, lon: 44.8015 }, { name: 'Batum', lat: 41.6418, lon: 41.6415 },
  ],
  'KAZAKISTAN': [
    { name: 'Astana', lat: 51.1801, lon: 71.4460 }, { name: 'Almatı', lat: 43.2220, lon: 76.8512 },
  ],
  'PAKISTAN': [
    { name: 'İslamabad', lat: 33.6844, lon: 73.0479 }, { name: 'Karaçi', lat: 24.8607, lon: 67.0011 },
    { name: 'Lahor', lat: 31.5204, lon: 74.3587 },
  ],
};

// ── CSS selector style helper ──────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  paddingRight: 28,
};

// ── CSV şablon ──────────────────────────────────────────────────────────────
const CSV_HEADERS = ['Misyon Adı', 'Kıta', 'Ülke', 'Şehir/İl', 'Tür', 'FortiGate Cihaz Adı', 'Enlem', 'Boylam'];
const CSV_EXAMPLE_ROWS = [
  ['PARIS_FW',   'AVRUPA',        'Fransa',  'Paris',       'BE', 'PARIS_FIREWALL',   '48.8566',  '2.3522'],
  ['ANKARA_FW',  'ASYA',          'Türkiye', 'Ankara',      'BE', '',                 '39.9334', '32.8597'],
  ['MEKSIKA_FW', 'KUZEY AMERICA', 'Meksika', 'Mexico City', 'BE', 'MEKSIKA_FIREWALL', '19.4326', '-99.133'],
];

function downloadTemplateCsv() {
  const rows = [CSV_HEADERS, ...CSV_EXAMPLE_ROWS].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'misyon_sablonu.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Basit CSV parser (noktalı virgül veya virgül destekli) ──────────────────
interface ParsedRow {
  name: string; continent: string; country: string; city: string; type: string;
  device_name: string; lat: number | null; lon: number | null;
  _line: number; _error?: string;
}

function parseCsvText(text: string): ParsedRow[] {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };
  const dataLines = lines.slice(1);
  return dataLines.map((line, idx) => {
    const cols = splitLine(line);
    const get = (i: number) => (cols[i] ?? '').replace(/^"|"$/g, '').trim();
    const name = get(0);
    const latStr = get(6); const lonStr = get(7);
    const lat = latStr ? Number(latStr) : null;
    const lon = lonStr ? Number(lonStr) : null;
    let _error: string | undefined;
    if (!name) _error = 'Misyon adı boş';
    else if (latStr && isNaN(lat!)) _error = 'Enlem geçersiz sayı';
    else if (lonStr && isNaN(lon!)) _error = 'Boylam geçersiz sayı';
    return { name, continent: get(1), country: get(2), city: get(3), type: get(4),
      device_name: get(5), lat, lon, _line: idx + 2, _error };
  });
}

// ── Tag çoklu seçici ────────────────────────────────────────────────────────
function TagSelector({ tags, selected, onChange }: {
  tags: MissionTag[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  if (tags.length === 0) {
    return (
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Henüz tag yok — Ayarlar &gt; Taglar kısmından ekleyebilirsiniz.
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(tag => {
        const active = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onChange(active ? selected.filter(id => id !== tag.id) : [...selected, tag.id])}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontSize: '0.78rem',
              background: active ? `${tag.color}22` : 'var(--bg-elevated)',
              border: `1px solid ${active ? tag.color : 'var(--border)'}`,
              color: active ? tag.color : 'var(--text-muted)',
              fontWeight: active ? 700 : 400,
              transition: 'all 0.15s',
            }}
          >
            {renderTagIcon(tag.icon, 16)}
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

interface PendingDevice {
  id: string;
  deviceName: string;
  vpnName?: string;
  time: string;
}

interface Props {
  cityList: CityRow[];
  onAdd: (form: Omit<CityRow, 'id'>) => Promise<void>;
  onUpdate: (city: CityRow) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  pendingDevices?: PendingDevice[];
  onDismissPending?: (deviceName: string) => void;
}

const emptyForm: Omit<CityRow, 'id'> = { name: '', continent: '', country: '', city: '', type: '', lat: null, lon: null, device_name: '', is_starlink: false, satellite_type: null, terrestrial_type: null, tags: [] };

const FIELD_LABELS: Record<string, string> = { name: 'Misyon Adı *', continent: 'Kıta', country: 'Ülke', city: 'Şehir/İl', type: 'Tür (BE, DT...)', device_name: 'FortiGate Cihaz Adı' };

export default function MissionManager({ cityList, onAdd, onUpdate, onDelete, pendingDevices = [], onDismissPending }: Props) {
  const t = useT();
  const { data: allTags = [] } = useTags();
  const { data: missions = [] } = useMissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch]       = useState('');
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  const [dataFilter, setDataFilter] = useState<'all' | 'with_data' | 'no_data'>('all');
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm] = useState<Omit<CityRow, 'id'>>(emptyForm);
  const [editing, setEditing] = useState<CityRow | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sortCol, setSortCol] = useState<'id' | 'name'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── Toplu Import state ──────────────────────────────────────────────────
  const [importRows, setImportRows] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: Array<{ row: string; error: string }> } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = parseCsvText(text);
      setImportRows(rows);
      setImportResult(null);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    if (!importRows) return;
    const valid = importRows.filter(r => !r._error);
    if (!valid.length) return;
    setImporting(true);
    try {
      const res = await fetch('/api/cities/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valid.map(({ _line: _l, _error: _e, ...r }) => r)),
      });
      const result = await res.json();
      setImportResult(result);
      setImportRows(null);
      if (result.success > 0) showSuccess(`✓ ${result.success} misyon başarıyla eklendi.`);
    } catch {
      setError('Import hatası. Lütfen tekrar deneyin.');
    }
    setImporting(false);
  };

  const toggleSort = (col: 'id' | 'name') => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const filtered = useMemo(() => cityList
    .filter(c => {
      if (search) {
        const q = search.toLowerCase();
        const textMatch = (c.name ?? '').toLowerCase().includes(q)
          || (c.country ?? '').toLowerCase().includes(q)
          || (c.continent ?? '').toLowerCase().includes(q)
          || (c.type ?? '').toLowerCase().includes(q);
        if (!textMatch) return false;
      }
      if (tagFilter.length > 0) {
        const cityTagIds = (c.tags ?? []).map((tg: any) => typeof tg === 'object' ? tg.id : tg);
        if (!tagFilter.every(id => cityTagIds.includes(id))) return false;
      }
      if (dataFilter !== 'all') {
        const mission = missions.find(m => m.id === c.id);
        const hasData = mission ? hasAnyData(mission) : false;
        if (dataFilter === 'with_data' && !hasData) return false;
        if (dataFilter === 'no_data'   &&  hasData) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      return (a.name ?? '').localeCompare(b.name ?? '') * mul;
    }), [cityList, search, tagFilter, dataFilter, missions, sortDir]);

  const handleAdd = async () => {
    setError('');
    if (!form.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    if (!form.lat || !form.lon) { setError('Enlem ve boylam zorunludur.'); return; }
    try {
      await onAdd(form);
      // Pending listede eşleşen cihaz varsa otomatik kaldır (device_name ile eşleş)
      if (form.device_name && onDismissPending) onDismissPending(form.device_name);
      setForm(emptyForm);
      setShowAdd(false);
      showSuccess(`✓ "${form.name}" başarıyla eklendi.`);
    } catch {
      setError('Kayıt hatası. Lütfen tekrar deneyin.');
    }
  };

  const handleTransferToForm = (d: PendingDevice) => {
    setForm({ ...emptyForm, name: d.deviceName, device_name: d.deviceName });
    setEditing(null);
    setShowAdd(true);
    setError('');
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setError('');
    if (!editing.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    try {
      await onUpdate(editing);
      showSuccess(`✓ "${editing.name}" güncellendi.`);
      setEditing(null);
    } catch {
      setError('Güncelleme hatası.');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`"${name}" misyonunu silmek istiyor musunuz?`)) return;
    try {
      await onDelete(id);
      showSuccess(`✓ "${name}" silindi.`);
    } catch {
      setError('Silme hatası.');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 32px', background: 'var(--bg-base)', overflow: 'hidden' }} className="fade-in">
      {/* Gizli file input */}
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <List size={22} color="var(--accent)"/>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('missions_title')}</h1>
          <span className="badge badge-accent" style={{ marginLeft: '4px' }}>{cityList.length} misyon</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={downloadTemplateCsv}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
            title="Örnek CSV şablonunu indir">
            <Download size={13}/> CSV Şablon
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
            title="CSV dosyasından toplu misyon yükle">
            <Upload size={13}/> CSV Yükle
          </button>
          <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditing(null); setError(''); setForm(emptyForm); }}>
            <Plus size={14}/> {t('add_mission')}
          </button>
        </div>
      </div>

      {/* ── Veri durumu istatistik kartları ── */}
      {(() => {
        const withData    = missions.filter(m => hasAnyData(m)).length;
        const noData      = cityList.length - withData;
        const pct         = cityList.length > 0 ? Math.round((withData / cityList.length) * 100) : 0;
        const cards = [
          { label: 'Toplam Misyon',   value: cityList.length, color: 'var(--accent)',  bg: 'var(--accent-dim)',      border: 'rgba(56,189,248,0.25)' },
          { label: 'Veri Alınan',     value: withData,        color: 'var(--green)',   bg: 'var(--green-dim)',       border: 'rgba(34,197,94,0.25)'  },
          { label: 'Veri Alınamayan', value: noData,          color: noData > 0 ? '#6b7280' : 'var(--green)', bg: noData > 0 ? 'rgba(107,114,128,0.1)' : 'var(--green-dim)', border: noData > 0 ? 'rgba(107,114,128,0.25)' : 'rgba(34,197,94,0.25)' },
        ];
        return (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexShrink: 0, flexWrap: 'wrap' }}>
            {cards.map(c => (
              <div key={c.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 18px', borderRadius: 'var(--radius-sm)',
                background: c.bg, border: `1px solid ${c.border}`, flex: '1 1 140px',
              }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.3 }}>{c.label}</span>
              </div>
            ))}
            {/* Doluluk çubuğu */}
            <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '10px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <span>Kapsama Oranı</span>
                <span style={{ color: pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : '#f97316' }}>{pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${pct}%`,
                  background: pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : '#f97316',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bekleyen Bilinmeyen Cihazlar ── */}
      {pendingDevices.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '14px 18px', flexShrink: 0,
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} color="#f59e0b" />
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b' }}>
              Kayıtsız Cihazlar ({pendingDevices.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
              Bu cihazlardan veri geldi ancak misyon listesinde eşleşme bulunamadı.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingDevices.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '8px 12px', borderRadius: 6,
                background: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', minWidth: 140 }}>
                  {d.deviceName}
                </span>
                {d.vpnName && (
                  <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: 3, background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
                    {d.vpnName}
                  </span>
                )}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.time}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleTransferToForm(d)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700,
                      background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                      border: '1px solid rgba(245,158,11,0.4)', borderRadius: 5,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <Plus size={12} /> Misyon Olarak Ekle
                  </button>
                  <button
                    onClick={() => onDismissPending?.(d.deviceName)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', fontSize: '0.75rem', fontWeight: 600,
                      background: 'transparent', color: 'var(--text-muted)',
                      border: '1px solid var(--border)', borderRadius: 5,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <X size={11} /> Yoksay
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import Önizleme Modal */}
      {importRows && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 860, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--accent)' }}>
            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <FileText size={18} color="var(--accent)" />
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>CSV Önizleme</span>
              <span className="badge badge-accent" style={{ marginLeft: 4 }}>{importRows.length} satır</span>
              {importRows.filter(r => r._error).length > 0 && (
                <span style={{ background: 'var(--red-dim)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 99, fontSize: '0.7rem', padding: '1px 8px', fontWeight: 700 }}>
                  {importRows.filter(r => r._error).length} hatalı
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                ✅ Geçerli: {importRows.filter(r => !r._error).length} &nbsp;·&nbsp; ❌ Hatalı: {importRows.filter(r => r._error).length}
              </span>
            </div>

            {/* Tablo */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table className="data-table" style={{ fontSize: '0.78rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Misyon Adı</th><th>Kıta</th><th>Ülke</th><th>Şehir</th><th>Tür</th>
                    <th>Cihaz Adı</th><th className="right">Enlem</th><th className="right">Boylam</th>
                    <th style={{ width: 60 }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} style={r._error ? { background: 'rgba(239,68,68,0.07)', borderLeft: '2px solid #ef4444' } : { borderLeft: '2px solid #22c55e' }}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{r._line}</td>
                      <td style={{ fontWeight: 600 }}>{r.name || <span style={{ color: 'var(--red)', fontStyle: 'italic' }}>boş</span>}</td>
                      <td>{r.continent || '–'}</td>
                      <td>{r.country || '–'}</td>
                      <td>{r.city || '–'}</td>
                      <td>{r.type || '–'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{r.device_name || '–'}</td>
                      <td className="right" style={{ fontFamily: 'monospace' }}>{r.lat ?? '–'}</td>
                      <td className="right" style={{ fontFamily: 'monospace' }}>{r.lon ?? '–'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r._error
                          ? <span title={r._error}><AlertTriangle size={14} color="#ef4444" /></span>
                          : <CheckCircle size={14} color="#22c55e" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer butonlar */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
              {importRows.filter(r => r._error).length > 0 && (
                <span style={{ fontSize: '0.75rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={13} /> Hatalı satırlar atlanır, geçerli satırlar eklenir.
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setImportRows(null)}>
                  <X size={13} /> İptal
                </button>
                <button
                  className="btn btn-primary"
                  disabled={importing || importRows.filter(r => !r._error).length === 0}
                  onClick={handleBulkImport}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {importing
                    ? <><span style={{ width: 12, height: 12, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Ekleniyor...</>
                    : <><CheckCircle size={13} /> {importRows.filter(r => !r._error).length} Misyonu Ekle</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Sonucu */}
      {importResult && (
        <div style={{ background: importResult.errors.length ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${importResult.errors.length ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`, borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '14px', fontSize: '0.82rem', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: importResult.errors.length ? 8 : 0, color: importResult.errors.length ? 'var(--amber)' : '#4ade80' }}>
            ✓ {importResult.success} misyon eklendi{importResult.errors.length > 0 ? `, ${importResult.errors.length} satır hatalı` : '.'}
          </div>
          {importResult.errors.map((e, i) => (
            <div key={i} style={{ color: '#fca5a5', fontSize: '0.75rem' }}>• {e.row}: {e.error}</div>
          ))}
          <button onClick={() => setImportResult(null)} style={{ marginTop: 8, fontSize: '0.7rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Kapat ×</button>
        </div>
      )}

      {/* Search + Tag filtre */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, flexShrink: 0 }}>
        <input
          className="form-control"
          placeholder={t('search') + '...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ margin: 0 }}
        />
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              <Tag size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Tag:
            </span>
            {allTags.map(tag => {
              const active = tagFilter.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setTagFilter(prev => active ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', fontSize: '0.75rem',
                    background: active ? `${tag.color}22` : 'var(--bg-elevated)',
                    border: `1px solid ${active ? tag.color : 'var(--border)'}`,
                    color: active ? tag.color : 'var(--text-muted)',
                    fontWeight: active ? 700 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {renderTagIcon(tag.icon, 13)}
                  {tag.name}
                </button>
              );
            })}
            {tagFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setTagFilter([])}
                style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <X size={10} /> Temizle
              </button>
            )}
          </div>
        )}
        {/* Veri durumu filtresi */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            Veri:
          </span>
          {([
            { key: 'all',       label: 'Tümü',           color: 'var(--accent)',  dot: null },
            { key: 'with_data', label: 'Veri Alınan',    color: '#22c55e',        dot: '#22c55e' },
            { key: 'no_data',   label: 'Veri Gelmeyen',  color: '#6b7280',        dot: '#6b7280' },
          ] as const).map(opt => {
            const active = dataFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDataFilter(opt.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', fontSize: '0.75rem',
                  background: active ? `${opt.color}22` : 'var(--bg-elevated)',
                  border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                  color: active ? opt.color : 'var(--text-muted)',
                  fontWeight: active ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {opt.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: opt.dot, display: 'inline-block', flexShrink: 0 }} />}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Success */}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.85rem', fontWeight: 600, animation: 'slideIn 0.3s ease' }}>
          {success}
        </div>
      )}
      {/* Error */}
      {error && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {/* Add Form — Modal Panel */}
      {showAdd && (() => {
        const citySuggestions = form.country ? (COUNTRY_CITIES[form.country] ?? []) : [];
        const datalistId = 'city-suggestions-add';

        const handleCountryChange = (country: string) => {
          // Ülke seçilince ülke merkezi koordinatlarını otomatik doldur
          const coord = COUNTRY_COORDS[country];
          setForm(prev => ({
            ...prev,
            country,
            city: '',
            lat: coord ? coord.lat : prev.lat,
            lon: coord ? coord.lon : prev.lon,
          }));
        };

        const handleCityChange = (cityName: string) => {
          // Şehir listesindeyse o şehrin koordinatını kullan
          const match = citySuggestions.find(c => c.name === cityName);
          if (match) {
            setForm(prev => ({ ...prev, city: cityName, lat: match.lat, lon: match.lon }));
          } else {
            setForm(prev => ({ ...prev, city: cityName }));
          }
        };

        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div className="glass-card fade-in" style={{
              width: '100%', maxWidth: 780, maxHeight: '92vh',
              overflow: 'hidden auto', padding: 0,
              border: '1px solid rgba(56,189,248,0.4)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '18px 24px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(56,189,248,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MapPin size={18} color="var(--accent)" />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent)' }}>{t('add_mission')}</h3>
                  {form.device_name && pendingDevices.some(d => d.deviceName === form.device_name) && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={11} /> Kayıtsız cihazdan aktarıldı
                    </span>
                  )}
                </div>
                <button onClick={() => { setShowAdd(false); setError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              {/* Form Body */}
              <div style={{ padding: '20px 24px' }}>
                {/* Row 1: Misyon Adı + Tür */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                      Misyon Adı <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input className="form-control" placeholder="Örn: PARIS_FW"
                      value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                      Tür
                    </label>
                    <input className="form-control" placeholder="BE, DT, ..." style={{ textTransform: 'uppercase' }}
                      value={form.type ?? ''} onChange={e => setForm({ ...form, type: e.target.value })} />
                  </div>
                </div>

                {/* Row 2: Kıta → Ülke → Şehir (cascade) */}
                <div style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.12)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={11} /> Coğrafi Konum (cascade seçim → koordinatlar otomatik dolar)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {/* Kıta */}
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Kıta</label>
                      <select style={selectStyle} value={form.continent ?? ''}
                        onChange={e => setForm({ ...form, continent: e.target.value, country: '', city: '' })}>
                        <option value="">— Kıta seçin</option>
                        {Object.keys(GEO_DATA).map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    {/* Ülke */}
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Ülke</label>
                      <select style={{ ...selectStyle, borderColor: form.country ? 'rgba(56,189,248,0.5)' : undefined }}
                        value={form.country ?? ''}
                        onChange={e => handleCountryChange(e.target.value)}
                        disabled={!form.continent}>
                        <option value="">— Ülke seçin</option>
                        {(form.continent ? GEO_DATA[form.continent] ?? [] : ALL_COUNTRIES).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    {/* Şehir */}
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                        Şehir / İl
                        {citySuggestions.length > 0 && (
                          <span style={{ marginLeft: 6, font: 'normal 9px/1 inherit', color: 'var(--accent)', fontWeight: 600 }}>
                            {citySuggestions.length} öneri ↓
                          </span>
                        )}
                      </label>
                      <datalist id={datalistId}>
                        {citySuggestions.map(c => <option key={c.name} value={c.name} />)}
                      </datalist>
                      <input
                        className="form-control"
                        list={datalistId}
                        placeholder={citySuggestions.length > 0 ? 'Şehir seçin veya yazın...' : 'Şehir / İl'}
                        value={form.city ?? ''}
                        disabled={!form.country}
                        onChange={e => handleCityChange(e.target.value)}
                        style={{ borderColor: form.city ? 'rgba(56,189,248,0.5)' : undefined }}
                      />
                    </div>
                  </div>
                  {/* Koordinat göstergesi */}
                  {(form.lat || form.lon) && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Koordinatlar otomatik dolduruldu:</span>
                      <span style={{ fontFamily: 'monospace' }}>{form.lat?.toFixed(4)}, {form.lon?.toFixed(4)}</span>
                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(düzenleyebilirsiniz)</span>
                    </div>
                  )}
                </div>

                {/* Row 3: Koordinatlar — ince, düzenlenebilir */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                      Enlem <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input className="form-control" placeholder="Örn: 41.0082" type="number" step="any"
                      value={form.lat !== null && form.lat !== undefined ? form.lat : ''} onChange={e => setForm({ ...form, lat: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                      Boylam <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input className="form-control" placeholder="Örn: 28.9784" type="number" step="any"
                      value={form.lon !== null && form.lon !== undefined ? form.lon : ''} onChange={e => setForm({ ...form, lon: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                </div>

                {/* Row 4: FortiGate Cihaz Adı */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                    FortiGate Cihaz Adı <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(opsiyonel)</span>
                  </label>
                  <input className="form-control" placeholder="Boşsa Misyon Adı kullanılır — webhook eşleştirmesi için"
                    value={form.device_name ?? ''}
                    onChange={e => setForm({ ...form, device_name: e.target.value })}
                    style={{ width: '100%' }} />
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    FortiGate&#39;in webhook&#39;ta gönderdiği cihaz adı misyon adından farklıysa buraya girin. Örn: misyon adı &#34;Port of Spain&#34;, cihaz adı &#34;PORT_OF_SPAIN_FW&#34;
                  </p>
                </div>

                {/* Row 5: Taglar */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Tag size={13} color="var(--accent)" />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Taglar</span>
                  </div>
                  <TagSelector tags={allTags} selected={form.tags ?? []} onChange={ids => setForm({ ...form, tags: ids })} />
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setError(''); }}>
                    <X size={13} /> {t('cancel')}
                  </button>
                  <button className="btn btn-success" onClick={handleAdd}>
                    <Check size={13} /> {t('save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Table — wrapper kendi scroll eder, thead sticky kalır */}
      <div className="glass-card" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table className="data-table" style={{ minWidth: 900 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
            <tr>
              <th style={{ width: 40, color: 'var(--text-muted)', userSelect: 'none', whiteSpace: 'nowrap' }} title="Sıra numarası">
                #
              </th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => toggleSort('name')}>
                {t('mission_name')} {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{opacity:0.3}}>↕</span>}
              </th>
              <th>{t('continent')}</th><th>{t('country')}</th><th>Şehir/İl</th><th>{t('city_type')}</th>
              <th>{t('device_name')}</th>
              <th style={{ textAlign: 'center' }}>Taglar</th>
              <th className="right">{t('latitude')}</th><th className="right">{t('longitude')}</th>
              <th style={{ textAlign: 'center' }}>{t('edit')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }}/>
                {search ? 'Arama sonucu bulunamadı' : 'Henüz misyon yok'}
              </td></tr>
            )}
            {filtered.map((c, idx) => editing?.id === c.id ? (
              <tr key={c.id} style={{ background: 'var(--bg-hover)' }}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} title={`DB ID: ${c.id}`}>{idx + 1}</td>
                {(['name'] as const).map(f => (
                  <td key={f} style={{ padding: '6px 8px' }}>
                    <input className="form-control" style={{ fontSize: '0.78rem', padding: '5px 8px', borderColor: 'var(--accent)' }}
                      value={editing[f] ?? ''}
                      onChange={e => setEditing({ ...editing, [f]: e.target.value })}/>
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  <select
                    style={{ ...selectStyle, fontSize: '0.78rem', padding: '4px 26px 4px 7px' }}
                    value={editing.continent ?? ''}
                    onChange={e => setEditing({ ...editing, continent: e.target.value, country: '', city: '' })}
                  >
                    <option value="">—</option>
                    {Object.keys(GEO_DATA).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <select
                    style={{ ...selectStyle, fontSize: '0.78rem', padding: '4px 26px 4px 7px' }}
                    value={editing.country ?? ''}
                    onChange={e => setEditing({ ...editing, country: e.target.value, city: '' })}
                  >
                    <option value="">—</option>
                    {(editing.continent ? GEO_DATA[editing.continent] ?? [] : ALL_COUNTRIES).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                {(['city', 'type'] as const).map(f => (
                  <td key={f} style={{ padding: '6px 8px' }}>
                    <input className="form-control" style={{ fontSize: '0.78rem', padding: '5px 8px', borderColor: 'var(--accent)' }}
                      value={editing[f] ?? ''}
                      onChange={e => setEditing({ ...editing, [f]: e.target.value })}/>
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  <input className="form-control" style={{ fontSize: '0.78rem', padding: '5px 8px', borderColor: 'var(--amber)', minWidth: 140 }}
                    placeholder="Cihaz adı (opsiyonel)"
                    value={editing.device_name ?? ''}
                    onChange={e => setEditing({ ...editing, device_name: e.target.value })}/>
                </td>
                <td style={{ padding: '4px 8px', maxWidth: 200 }}>
                  <TagSelector
                    tags={allTags}
                    selected={editing.tags ?? []}
                    onChange={ids => setEditing({ ...editing, tags: ids })}
                  />
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <input type="number" step="any" className="form-control" style={{ width: 90, fontSize: '0.78rem', padding: '5px 8px' }}
                    value={editing.lat ?? ''} onChange={e => setEditing({ ...editing, lat: e.target.value ? Number(e.target.value) : null })}/>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <input type="number" step="any" className="form-control" style={{ width: 90, fontSize: '0.78rem', padding: '5px 8px' }}
                    value={editing.lon ?? ''} onChange={e => setEditing({ ...editing, lon: e.target.value ? Number(e.target.value) : null })}/>
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-success btn-icon" style={{ marginRight: 4 }} onClick={handleUpdate}><Check size={13}/></button>
                  <button className="btn btn-secondary btn-icon" onClick={() => { setEditing(null); setError(''); }}><X size={13}/></button>
                </td>
              </tr>
            ) : (
              <tr key={c.id} style={(!c.lat || !c.lon) ? { background: 'rgba(245,158,11,0.06)', borderLeft: '2px solid var(--amber)' } : undefined}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} title={`DB ID: ${c.id}`}>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>
                  {c.name}
                  {(!c.lat || !c.lon) && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: '0.65rem' }}>⚠️ Koordinat yok</span>}
                </td>
                <td>{c.continent ? <span className="badge badge-neutral">{c.continent}</span> : '–'}</td>
                <td>{c.country ?? '–'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.city ?? '–'}</td>
                <td>{c.type ? <span className="badge badge-accent">{c.type}</span> : '–'}</td>
                <td style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {c.device_name
                    ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{c.device_name}</span>
                    : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>= misyon adı</span>}
                </td>
                <td style={{ maxWidth: 180 }}>
                  {(c.tags ?? []).length > 0
                    ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(c.tags ?? []).map(id => {
                          const tag = allTags.find(t => t.id === id);
                          if (!tag) return null;
                          return (
                            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 700, color: tag.color, background: `${tag.color}22`, border: `1px solid ${tag.color}55`, borderRadius: 4, padding: '2px 6px' }}>
                              {renderTagIcon(tag.icon, 13)}{tag.name}
                            </span>
                          );
                        })}
                      </div>
                    : <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>–</span>}
                </td>
                <td className="right" style={{ fontFamily: 'monospace', color: (!c.lat || !c.lon) ? 'var(--amber)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lat != null ? Number(c.lat).toFixed(5) : '—'}</td>
                <td className="right" style={{ fontFamily: 'monospace', color: (!c.lat || !c.lon) ? 'var(--amber)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lon != null ? Number(c.lon).toFixed(5) : '—'}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn-icon btn" style={{ marginRight: 4 }} onClick={() => { setEditing({ ...c, is_starlink: c.is_starlink ?? false, satellite_type: c.satellite_type ?? null, terrestrial_type: c.terrestrial_type ?? null, tags: c.tags ?? [] }); setShowAdd(false); setError(''); }}><Pencil size={13}/></button>
                  <button className="btn btn-danger btn-icon" onClick={() => handleDelete(c.id, c.name)}><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', gap: 16, flexShrink: 0 }}>
        <span>{filtered.length} / {cityList.length} misyon gösteriliyor</span>
        {cityList.filter(c => !c.lat || !c.lon).length > 0 && (
          <span style={{ color: 'var(--amber)' }}>⚠️ {cityList.filter(c => !c.lat || !c.lon).length} kayıt koordinatsız — haritada görünmez</span>
        )}
      </div>
    </div>
  );
}
