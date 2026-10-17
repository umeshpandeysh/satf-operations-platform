/**
 * SATF Operations Platform — Centralized Mock Dataset
 *
 * This file provides a deterministic, typed dataset for Phase 1 of the
 * SATF Operations Platform. All names, booking references, flight numbers,
 * and hotel details are entirely fictional and designed for demonstration purposes only.
 *
 * All dates are generated dynamically relative to the current calendar date
 * in India (Asia/Kolkata timezone) using safe ISO date-string arithmetic.
 *
 * DO NOT import real guest or operational data here.
 */

import type { Tour, DashboardMetrics, AttentionItem } from "./types";
import { getIndiaTodayISO, addDaysToISO } from "./utils";

/**
 * Generate a complete set of coherent, deterministic mock tours relative to
 * a given reference date (YYYY-MM-DD). Defaults to current date in Asia/Kolkata.
 */
export function getMockTours(referenceDate: string = getIndiaTodayISO()): Tour[] {
  const t0 = referenceDate;

  return [
    // ─── SATF-DEMO-001 (Active Tour) ─────────────────────────────────────────
    {
      id: "tour-001",
      bookingReference: "SATF-DEMO-001",
      status: "active",
      destination: "Rajasthan Circuit",
      arrivalDate: addDaysToISO(t0, -2),
      departureDate: addDaysToISO(t0, 5),
      lastUpdated: `${addDaysToISO(t0, -1)}T09:30:00Z`,
      group: {
        id: "grp-001",
        groupName: "Nakamura Group",
        adultCount: 8,
        childCount: 2,
        nationality: "Japanese",
        language: "Japanese",
        contactPerson: "Hiroshi Nakamura",
        notes: "Group prefers early breakfast service. Travelling with two school-age children.",
      },
      flights: [
        {
          id: "flt-001a",
          direction: "arrival",
          flightNumber: "AI-811",
          airline: "Air India",
          date: addDaysToISO(t0, -2),
          departureTime: "06:30",
          arrivalTime: "11:10",
          origin: "Tokyo (NRT)",
          destination: "Delhi (DEL)",
          terminal: "T3",
        },
        {
          id: "flt-001b",
          direction: "departure",
          flightNumber: "AI-812",
          airline: "Air India",
          date: addDaysToISO(t0, 5),
          departureTime: "14:00",
          arrivalTime: "22:30",
          origin: "Delhi (DEL)",
          destination: "Tokyo (NRT)",
          terminal: "T3",
        },
      ],
      hotels: [
        {
          id: "htl-001a",
          hotelName: "Heritage Palace Jaipur",
          city: "Jaipur",
          checkIn: addDaysToISO(t0, -2),
          checkOut: addDaysToISO(t0, 1),
          roomType: "double",
          roomCount: 5,
          confirmationNumber: "HPJ-88123",
        },
        {
          id: "htl-001b",
          hotelName: "Desert Sands Resort",
          city: "Jaisalmer",
          checkIn: addDaysToISO(t0, 1),
          checkOut: addDaysToISO(t0, 3),
          roomType: "double",
          roomCount: 5,
          confirmationNumber: "DSR-44901",
        },
        {
          id: "htl-001c",
          hotelName: "Blue City Heritage",
          city: "Jodhpur",
          checkIn: addDaysToISO(t0, 3),
          checkOut: addDaysToISO(t0, 5),
          roomType: "double",
          roomCount: 5,
          confirmationNumber: "BCH-33210",
        },
      ],
      itinerary: [
        {
          id: "itn-001-01",
          date: addDaysToISO(t0, -2),
          startTime: "11:30",
          type: "arrival_transfer",
          title: "Airport arrival and transfer to Jaipur hotel",
          location: "Delhi Airport → Jaipur",
          durationMinutes: 240,
        },
        {
          id: "itn-001-02",
          date: addDaysToISO(t0, -1),
          startTime: "09:00",
          type: "sightseeing",
          title: "Amber Fort and City Palace",
          location: "Jaipur",
          description: "Guided tour of Amber Fort, Hawa Mahal exterior, and City Palace.",
          durationMinutes: 360,
        },
        {
          id: "itn-001-03",
          date: addDaysToISO(t0, 0),
          startTime: "09:00",
          type: "sightseeing",
          title: "Jantar Mantar and local bazaars",
          location: "Jaipur",
          durationMinutes: 300,
        },
        {
          id: "itn-001-04",
          date: addDaysToISO(t0, 1),
          startTime: "07:00",
          type: "transfer",
          title: "Jaipur to Jaisalmer (road transit)",
          location: "Jaipur → Jaisalmer",
          durationMinutes: 420,
        },
        {
          id: "itn-001-05",
          date: addDaysToISO(t0, 2),
          startTime: "09:30",
          type: "sightseeing",
          title: "Jaisalmer Fort and Patwon Ki Haveli",
          location: "Jaisalmer",
          durationMinutes: 300,
        },
        {
          id: "itn-001-06",
          date: addDaysToISO(t0, 2),
          startTime: "16:00",
          type: "activity",
          title: "Sand dune safari — Khuri",
          location: "Khuri, Jaisalmer",
          durationMinutes: 180,
        },
        {
          id: "itn-001-07",
          date: addDaysToISO(t0, 3),
          startTime: "07:00",
          type: "transfer",
          title: "Jaisalmer to Jodhpur (road transit)",
          location: "Jaisalmer → Jodhpur",
          durationMinutes: 300,
        },
        {
          id: "itn-001-08",
          date: addDaysToISO(t0, 4),
          startTime: "09:00",
          type: "sightseeing",
          title: "Mehrangarh Fort and Jaswant Thada",
          location: "Jodhpur",
          durationMinutes: 300,
        },
        {
          id: "itn-001-09",
          date: addDaysToISO(t0, 5),
          startTime: "08:00",
          type: "departure_transfer",
          title: "Transfer Jodhpur to Delhi airport",
          location: "Jodhpur → Delhi (DEL)",
          durationMinutes: 480,
          notes: "Flight at 14:00. Buffer allocated for T3 international check-in.",
        },
      ],
      assignments: [
        {
          id: "asn-001a",
          role: "guide",
          status: "assigned",
          name: "Ramesh Kumar",
          reference: "GD-JK-019",
        },
        {
          id: "asn-001b",
          role: "driver",
          status: "assigned",
          name: "Suresh Meena",
          reference: "DRV-RJ-042",
        },
        {
          id: "asn-001c",
          role: "vehicle",
          status: "assigned",
          reference: "RJ-14-AB-1234",
          notes: "Tempo Traveller — 10-seater",
        },
      ],
      specialRequests: [
        {
          id: "sr-001a",
          category: "dietary",
          description: "Vegetarian meals requested for two travellers.",
          resolved: true,
        },
        {
          id: "sr-001b",
          category: "accessibility",
          description: "Ground-floor or step-free room access requested for one senior guest.",
          resolved: true,
        },
      ],
      operationalNotes:
        "Tour is currently active in Rajasthan. All hotels confirmed. Guide checked in on schedule.",
    },

    // ─── SATF-DEMO-002 (Upcoming Tour) ───────────────────────────────────────
    {
      id: "tour-002",
      bookingReference: "SATF-DEMO-002",
      status: "upcoming",
      destination: "Kerala Backwaters",
      arrivalDate: addDaysToISO(t0, 2),
      departureDate: addDaysToISO(t0, 9),
      lastUpdated: `${addDaysToISO(t0, -3)}T14:00:00Z`,
      group: {
        id: "grp-002",
        groupName: "Tanaka–Sato Party",
        adultCount: 4,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
        contactPerson: "Yuki Tanaka",
      },
      flights: [
        {
          id: "flt-002a",
          direction: "arrival",
          flightNumber: "NH-833",
          airline: "ANA",
          date: addDaysToISO(t0, 2),
          departureTime: "10:05",
          arrivalTime: "16:40",
          origin: "Tokyo (NRT)",
          destination: "Kochi (COK)",
          terminal: "International",
        },
        {
          id: "flt-002b",
          direction: "departure",
          flightNumber: "NH-834",
          airline: "ANA",
          date: addDaysToISO(t0, 9),
          departureTime: "18:30",
          arrivalTime: "06:20+1",
          origin: "Kochi (COK)",
          destination: "Tokyo (NRT)",
          terminal: "International",
        },
      ],
      hotels: [
        {
          id: "htl-002a",
          hotelName: "Backwater Retreat Alleppey",
          city: "Alleppey",
          checkIn: addDaysToISO(t0, 2),
          checkOut: addDaysToISO(t0, 5),
          roomType: "double",
          roomCount: 2,
          confirmationNumber: "BRA-77502",
        },
        {
          id: "htl-002b",
          hotelName: "Spice Garden Resort",
          city: "Munnar",
          checkIn: addDaysToISO(t0, 5),
          checkOut: addDaysToISO(t0, 8),
          roomType: "double",
          roomCount: 2,
          confirmationNumber: "SGR-22901",
        },
        {
          id: "htl-002c",
          hotelName: "Fort Kochi Heritage Inn",
          city: "Kochi",
          checkIn: addDaysToISO(t0, 8),
          checkOut: addDaysToISO(t0, 9),
          roomType: "double",
          roomCount: 2,
          confirmationNumber: "FKH-10034",
        },
      ],
      itinerary: [
        {
          id: "itn-002-01",
          date: addDaysToISO(t0, 2),
          startTime: "17:00",
          type: "arrival_transfer",
          title: "Kochi airport arrival — transfer to Alleppey",
          location: "Kochi (COK) → Alleppey",
          durationMinutes: 90,
        },
        {
          id: "itn-002-02",
          date: addDaysToISO(t0, 3),
          startTime: "09:00",
          type: "activity",
          title: "Houseboat cruise — Vembanad Lake",
          location: "Alleppey backwaters",
          durationMinutes: 480,
        },
        {
          id: "itn-002-03",
          date: addDaysToISO(t0, 4),
          startTime: "09:30",
          type: "sightseeing",
          title: "Kuttanad village and canoe ride",
          location: "Kuttanad, Kerala",
          durationMinutes: 300,
        },
        {
          id: "itn-002-04",
          date: addDaysToISO(t0, 5),
          startTime: "08:00",
          type: "transfer",
          title: "Alleppey to Munnar (road transit)",
          location: "Alleppey → Munnar",
          durationMinutes: 210,
        },
        {
          id: "itn-002-05",
          date: addDaysToISO(t0, 6),
          startTime: "09:00",
          type: "sightseeing",
          title: "Tea plantations and Eravikulam National Park",
          location: "Munnar",
          durationMinutes: 360,
        },
        {
          id: "itn-002-06",
          date: addDaysToISO(t0, 7),
          startTime: "09:30",
          type: "activity",
          title: "Cardamom plantation walk and spice village visit",
          location: "Munnar",
          durationMinutes: 270,
        },
        {
          id: "itn-002-07",
          date: addDaysToISO(t0, 8),
          startTime: "08:00",
          type: "transfer",
          title: "Munnar to Fort Kochi",
          location: "Munnar → Kochi",
          durationMinutes: 210,
        },
        {
          id: "itn-002-08",
          date: addDaysToISO(t0, 8),
          startTime: "14:00",
          type: "sightseeing",
          title: "Fort Kochi walk — Chinese fishing nets, Dutch Palace",
          location: "Fort Kochi",
          durationMinutes: 240,
        },
        {
          id: "itn-002-09",
          date: addDaysToISO(t0, 9),
          startTime: "15:00",
          type: "departure_transfer",
          title: "Transfer to Kochi airport",
          location: "Fort Kochi → Kochi (COK)",
          durationMinutes: 60,
        },
      ],
      assignments: [
        {
          id: "asn-002a",
          role: "guide",
          status: "assigned",
          name: "Priya Nair",
          reference: "GD-KL-007",
        },
        {
          id: "asn-002b",
          role: "driver",
          status: "unassigned",
          notes: "Driver allocation pending confirmation with Kerala transport partner.",
        },
        {
          id: "asn-002c",
          role: "vehicle",
          status: "unassigned",
          notes: "Vehicle to be allocated alongside driver confirmation.",
        },
      ],
      specialRequests: [
        {
          id: "sr-002a",
          category: "dietary",
          description: "Fish-free meal options requested for entire party.",
          resolved: false,
        },
      ],
      operationalNotes:
        "Upcoming arrival in 2 days. Driver and vehicle allocation must be finalized before arrival.",
    },

    // ─── SATF-DEMO-003 (Needs Attention — Arriving Today) ────────────────────
    {
      id: "tour-003",
      bookingReference: "SATF-DEMO-003",
      status: "attention",
      destination: "Golden Triangle",
      arrivalDate: addDaysToISO(t0, 0),
      departureDate: addDaysToISO(t0, 7),
      lastUpdated: `${addDaysToISO(t0, 0)}T07:15:00Z`,
      group: {
        id: "grp-003",
        groupName: "Watanabe–Ito Group",
        adultCount: 6,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
        contactPerson: "Kenji Watanabe",
      },
      flights: [
        {
          id: "flt-003a",
          direction: "arrival",
          flightNumber: "JL-751",
          airline: "Japan Airlines",
          date: addDaysToISO(t0, 0),
          departureTime: "08:45",
          arrivalTime: "14:15",
          origin: "Osaka (KIX)",
          destination: "Delhi (DEL)",
          terminal: "T3",
        },
        {
          id: "flt-003b",
          direction: "departure",
          flightNumber: "JL-752",
          airline: "Japan Airlines",
          date: addDaysToISO(t0, 7),
          departureTime: "16:00",
          arrivalTime: "23:45",
          origin: "Delhi (DEL)",
          destination: "Osaka (KIX)",
          terminal: "T3",
        },
      ],
      hotels: [
        {
          id: "htl-003a",
          hotelName: "Imperial Grand Delhi",
          city: "Delhi",
          checkIn: addDaysToISO(t0, 0),
          checkOut: addDaysToISO(t0, 2),
          roomType: "double",
          roomCount: 3,
          confirmationNumber: "IGD-50012",
        },
        {
          id: "htl-003b",
          hotelName: "Taj Mahal View Resort",
          city: "Agra",
          checkIn: addDaysToISO(t0, 2),
          checkOut: addDaysToISO(t0, 4),
          roomType: "double",
          roomCount: 3,
          confirmationNumber: "TMV-81023",
        },
        {
          id: "htl-003c",
          hotelName: "Pink City Classic",
          city: "Jaipur",
          checkIn: addDaysToISO(t0, 4),
          checkOut: addDaysToISO(t0, 7),
          roomType: "double",
          roomCount: 3,
        },
      ],
      itinerary: [
        {
          id: "itn-003-01",
          date: addDaysToISO(t0, 0),
          startTime: "14:30",
          type: "arrival_transfer",
          title: "Delhi airport arrival — transfer to hotel",
          location: "Delhi (DEL) → Delhi hotel",
          durationMinutes: 90,
        },
        {
          id: "itn-003-02",
          date: addDaysToISO(t0, 1),
          startTime: "09:00",
          type: "sightseeing",
          title: "Old Delhi tour — Red Fort, Jama Masjid, Chandni Chowk",
          location: "Old Delhi",
          durationMinutes: 360,
        },
        {
          id: "itn-003-03",
          date: addDaysToISO(t0, 2),
          startTime: "07:00",
          type: "transfer",
          title: "Delhi to Agra — Yamuna Expressway",
          location: "Delhi → Agra",
          durationMinutes: 180,
        },
        {
          id: "itn-003-04",
          date: addDaysToISO(t0, 2),
          startTime: "11:00",
          type: "sightseeing",
          title: "Taj Mahal and Agra Fort",
          location: "Agra",
          durationMinutes: 360,
        },
        {
          id: "itn-003-05",
          date: addDaysToISO(t0, 3),
          startTime: "09:00",
          type: "sightseeing",
          title: "Fatehpur Sikri",
          location: "Fatehpur Sikri, Agra",
          durationMinutes: 240,
        },
        {
          id: "itn-003-06",
          date: addDaysToISO(t0, 4),
          startTime: "07:00",
          type: "transfer",
          title: "Agra to Jaipur — NH-21",
          location: "Agra → Jaipur",
          durationMinutes: 240,
        },
        {
          id: "itn-003-07",
          date: addDaysToISO(t0, 5),
          startTime: "09:00",
          type: "sightseeing",
          title: "Amber Fort and Jaigarh Fort",
          location: "Jaipur",
          durationMinutes: 300,
        },
        {
          id: "itn-003-08",
          date: addDaysToISO(t0, 6),
          startTime: "09:30",
          type: "sightseeing",
          title: "City Palace and Jantar Mantar",
          location: "Jaipur",
          durationMinutes: 270,
        },
        {
          id: "itn-003-09",
          date: addDaysToISO(t0, 7),
          startTime: "10:00",
          type: "departure_transfer",
          title: "Jaipur to Delhi airport",
          location: "Jaipur → Delhi (DEL)",
          durationMinutes: 300,
        },
      ],
      assignments: [
        {
          id: "asn-003a",
          role: "guide",
          status: "assigned",
          name: "Anil Sharma",
          reference: "GD-DL-033",
        },
        {
          id: "asn-003b",
          role: "driver",
          status: "assigned",
          name: "Mohan Das",
          reference: "DRV-DL-018",
        },
        {
          id: "asn-003c",
          role: "vehicle",
          status: "pending",
          notes: "Primary vehicle breakdown reported this morning. Replacement vehicle dispatch in progress.",
        },
      ],
      specialRequests: [
        {
          id: "sr-003a",
          category: "dietary",
          description: "Low-sugar meal options requested for one traveller.",
          resolved: false,
        },
      ],
      operationalNotes:
        "ATTENTION: Primary vehicle breakdown reported this morning. Replacement vehicle dispatch in progress. Hotel Pink City Classic Jaipur confirmation number pending.",
    },

    // ─── SATF-DEMO-004 (Needs Attention — Upcoming in 5 Days) ─────────────────
    {
      id: "tour-004",
      bookingReference: "SATF-DEMO-004",
      status: "attention",
      destination: "Himachal Pradesh",
      arrivalDate: addDaysToISO(t0, 5),
      departureDate: addDaysToISO(t0, 13),
      lastUpdated: `${addDaysToISO(t0, -2)}T10:15:00Z`,
      group: {
        id: "grp-004",
        groupName: "Yamamoto–Fujii Couple",
        adultCount: 2,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
        contactPerson: "Hiroko Yamamoto",
      },
      flights: [
        {
          id: "flt-004a",
          direction: "arrival",
          flightNumber: "AI-315",
          airline: "Air India",
          date: addDaysToISO(t0, 5),
          departureTime: "07:00",
          arrivalTime: "11:30",
          origin: "Tokyo (HND)",
          destination: "Delhi (DEL)",
          terminal: "T3",
        },
        {
          id: "flt-004b",
          direction: "departure",
          flightNumber: "AI-316",
          airline: "Air India",
          date: addDaysToISO(t0, 13),
          departureTime: "15:30",
          arrivalTime: "23:00",
          origin: "Delhi (DEL)",
          destination: "Tokyo (HND)",
          terminal: "T3",
        },
      ],
      hotels: [
        {
          id: "htl-004a",
          hotelName: "Pine Ridge Lodge",
          city: "Shimla",
          checkIn: addDaysToISO(t0, 5),
          checkOut: addDaysToISO(t0, 9),
          roomType: "double",
          roomCount: 1,
          confirmationNumber: "PRL-90011",
        },
        {
          id: "htl-004b",
          hotelName: "Himalayan View Retreat",
          city: "Manali",
          checkIn: addDaysToISO(t0, 9),
          checkOut: addDaysToISO(t0, 13),
          roomType: "double",
          roomCount: 1,
          confirmationNumber: "HVR-67234",
        },
      ],
      itinerary: [
        {
          id: "itn-004-01",
          date: addDaysToISO(t0, 5),
          startTime: "12:00",
          type: "arrival_transfer",
          title: "Delhi to Shimla — road transfer",
          location: "Delhi → Shimla",
          durationMinutes: 360,
        },
        {
          id: "itn-004-02",
          date: addDaysToISO(t0, 6),
          startTime: "09:30",
          type: "sightseeing",
          title: "Shimla Heritage walk and Christ Church",
          location: "Shimla",
          durationMinutes: 270,
        },
        {
          id: "itn-004-03",
          date: addDaysToISO(t0, 7),
          startTime: "10:00",
          type: "activity",
          title: "Kufri snow activities",
          location: "Kufri, Shimla",
          durationMinutes: 300,
        },
        {
          id: "itn-004-04",
          date: addDaysToISO(t0, 8),
          startTime: "09:00",
          type: "sightseeing",
          title: "Chail and Naldehra excursion",
          location: "Chail, Himachal Pradesh",
          durationMinutes: 360,
        },
        {
          id: "itn-004-05",
          date: addDaysToISO(t0, 9),
          startTime: "07:30",
          type: "transfer",
          title: "Shimla to Manali — via Kullu Valley",
          location: "Shimla → Manali",
          durationMinutes: 420,
        },
        {
          id: "itn-004-06",
          date: addDaysToISO(t0, 10),
          startTime: "09:00",
          type: "sightseeing",
          title: "Rohtang Pass (weather dependent)",
          location: "Rohtang Pass, Manali",
          durationMinutes: 480,
          notes: "Special mountain route pass required — verify permit with local transport authority.",
        },
        {
          id: "itn-004-07",
          date: addDaysToISO(t0, 11),
          startTime: "09:30",
          type: "sightseeing",
          title: "Solang Valley and outdoor activities",
          location: "Solang Valley, Manali",
          durationMinutes: 360,
        },
        {
          id: "itn-004-08",
          date: addDaysToISO(t0, 12),
          startTime: "09:00",
          type: "activity",
          title: "Hadimba Temple and Manu Temple visit",
          location: "Manali",
          durationMinutes: 240,
        },
        {
          id: "itn-004-09",
          date: addDaysToISO(t0, 13),
          startTime: "05:00",
          type: "departure_transfer",
          title: "Manali to Delhi airport — departure transfer",
          location: "Manali → Delhi (DEL)",
          durationMinutes: 600,
          notes: "Early departure. Ensure driver is stationed the prior evening.",
        },
      ],
      assignments: [
        {
          id: "asn-004a",
          role: "guide",
          status: "unassigned",
          notes: "Himachal-certified Japanese-speaking guide required.",
        },
        {
          id: "asn-004b",
          role: "driver",
          status: "unassigned",
          notes: "Mountain-route certified driver required.",
        },
        {
          id: "asn-004c",
          role: "vehicle",
          status: "unassigned",
          notes: "4WD vehicle mandatory for Rohtang Pass sector.",
        },
      ],
      specialRequests: [],
      operationalNotes:
        "ATTENTION: Mountain-certified guide and 4WD vehicle unassigned. Rohtang Pass permit pending confirmation with Himachal transport authorities.",
    },

    // ─── SATF-DEMO-005 (Completed Tour) ──────────────────────────────────────
    {
      id: "tour-005",
      bookingReference: "SATF-DEMO-005",
      status: "completed",
      destination: "South India Circuit",
      arrivalDate: addDaysToISO(t0, -18),
      departureDate: addDaysToISO(t0, -7),
      lastUpdated: `${addDaysToISO(t0, -7)}T20:00:00Z`,
      group: {
        id: "grp-005",
        groupName: "Suzuki Corporate Party",
        adultCount: 12,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
        contactPerson: "Keiko Suzuki",
        notes: "Corporate study tour. No photo restrictions noted.",
      },
      flights: [
        {
          id: "flt-005a",
          direction: "arrival",
          flightNumber: "AI-307",
          airline: "Air India",
          date: addDaysToISO(t0, -18),
          departureTime: "09:00",
          arrivalTime: "14:45",
          origin: "Tokyo (NRT)",
          destination: "Chennai (MAA)",
          terminal: "International",
        },
        {
          id: "flt-005b",
          direction: "departure",
          flightNumber: "AI-308",
          airline: "Air India",
          date: addDaysToISO(t0, -7),
          departureTime: "11:30",
          arrivalTime: "21:00",
          origin: "Bangalore (BLR)",
          destination: "Tokyo (NRT)",
          terminal: "International",
        },
      ],
      hotels: [
        {
          id: "htl-005a",
          hotelName: "Coromandel Grand",
          city: "Chennai",
          checkIn: addDaysToISO(t0, -18),
          checkOut: addDaysToISO(t0, -15),
          roomType: "twin",
          roomCount: 6,
          confirmationNumber: "CG-21102",
        },
        {
          id: "htl-005b",
          hotelName: "Temple City Residency",
          city: "Madurai",
          checkIn: addDaysToISO(t0, -15),
          checkOut: addDaysToISO(t0, -12),
          roomType: "twin",
          roomCount: 6,
          confirmationNumber: "TCR-48823",
        },
        {
          id: "htl-005c",
          hotelName: "Garden City Suites",
          city: "Bangalore",
          checkIn: addDaysToISO(t0, -12),
          checkOut: addDaysToISO(t0, -7),
          roomType: "twin",
          roomCount: 6,
          confirmationNumber: "GCS-77001",
        },
      ],
      itinerary: [
        {
          id: "itn-005-01",
          date: addDaysToISO(t0, -18),
          startTime: "15:00",
          type: "arrival_transfer",
          title: "Chennai airport arrival",
          location: "Chennai (MAA)",
          durationMinutes: 60,
        },
        {
          id: "itn-005-02",
          date: addDaysToISO(t0, -17),
          startTime: "09:00",
          type: "sightseeing",
          title: "Mahabalipuram — Shore Temple and Pancha Rathas",
          location: "Mahabalipuram",
          durationMinutes: 360,
        },
        {
          id: "itn-005-03",
          date: addDaysToISO(t0, -16),
          startTime: "09:30",
          type: "sightseeing",
          title: "Kanchipuram temples",
          location: "Kanchipuram",
          durationMinutes: 300,
        },
        {
          id: "itn-005-04",
          date: addDaysToISO(t0, -15),
          startTime: "07:00",
          type: "transfer",
          title: "Chennai to Madurai",
          location: "Chennai → Madurai",
          durationMinutes: 480,
        },
        {
          id: "itn-005-05",
          date: addDaysToISO(t0, -14),
          startTime: "09:00",
          type: "sightseeing",
          title: "Meenakshi Amman Temple",
          location: "Madurai",
          durationMinutes: 300,
        },
        {
          id: "itn-005-06",
          date: addDaysToISO(t0, -12),
          startTime: "07:00",
          type: "transfer",
          title: "Madurai to Bangalore",
          location: "Madurai → Bangalore",
          durationMinutes: 420,
        },
        {
          id: "itn-005-07",
          date: addDaysToISO(t0, -11),
          startTime: "09:00",
          type: "sightseeing",
          title: "Mysore day excursion — Palace and Chamundi Hills",
          location: "Mysore",
          durationMinutes: 480,
        },
        {
          id: "itn-005-08",
          date: addDaysToISO(t0, -10),
          startTime: "09:30",
          type: "activity",
          title: "Bangalore city tour and Lalbagh Botanical Garden",
          location: "Bangalore",
          durationMinutes: 360,
        },
        {
          id: "itn-005-09",
          date: addDaysToISO(t0, -7),
          startTime: "07:00",
          type: "departure_transfer",
          title: "Transfer to Bangalore airport",
          location: "Bangalore (BLR)",
          durationMinutes: 90,
        },
      ],
      assignments: [
        {
          id: "asn-005a",
          role: "guide",
          status: "assigned",
          name: "Kavitha Rajan",
          reference: "GD-TN-014",
        },
        {
          id: "asn-005b",
          role: "driver",
          status: "assigned",
          name: "Prasad Krishnan",
          reference: "DRV-KL-029",
        },
        {
          id: "asn-005c",
          role: "vehicle",
          status: "assigned",
          reference: "KA-01-MM-5678",
          notes: "Tempo Traveller — 14-seater",
        },
      ],
      specialRequests: [
        {
          id: "sr-005a",
          category: "dietary",
          description: "Japanese-style breakfast options requested where available.",
          resolved: true,
        },
      ],
      operationalNotes: "Tour completed successfully. Post-tour debrief and feedback received.",
    },

    // ─── SATF-DEMO-006 (Upcoming Tour) ───────────────────────────────────────
    {
      id: "tour-006",
      bookingReference: "SATF-DEMO-006",
      status: "upcoming",
      destination: "Varanasi & Bodhgaya",
      arrivalDate: addDaysToISO(t0, 4),
      departureDate: addDaysToISO(t0, 11),
      lastUpdated: `${addDaysToISO(t0, -1)}T08:30:00Z`,
      group: {
        id: "grp-006",
        groupName: "Buddhist Pilgrimage — Ito Sangha",
        adultCount: 15,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
        contactPerson: "Rev. Masao Ito",
        notes: "Pilgrimage group. Vegetarian-only hotel catering required.",
      },
      flights: [
        {
          id: "flt-006a",
          direction: "arrival",
          flightNumber: "AI-307",
          airline: "Air India",
          date: addDaysToISO(t0, 4),
          departureTime: "08:00",
          arrivalTime: "12:30",
          origin: "Tokyo (NRT)",
          destination: "Delhi (DEL)",
          terminal: "T3",
        },
        {
          id: "flt-006b",
          direction: "departure",
          flightNumber: "AI-308",
          airline: "Air India",
          date: addDaysToISO(t0, 11),
          departureTime: "19:00",
          arrivalTime: "07:00+1",
          origin: "Varanasi (VNS)",
          destination: "Tokyo (NRT)",
          terminal: "International",
        },
      ],
      hotels: [
        {
          id: "htl-006a",
          hotelName: "Ganga View Heritage",
          city: "Varanasi",
          checkIn: addDaysToISO(t0, 4),
          checkOut: addDaysToISO(t0, 8),
          roomType: "twin",
          roomCount: 8,
          confirmationNumber: "GVH-30045",
        },
        {
          id: "htl-006b",
          hotelName: "Bodhi Tree Lodge",
          city: "Bodhgaya",
          checkIn: addDaysToISO(t0, 8),
          checkOut: addDaysToISO(t0, 11),
          roomType: "twin",
          roomCount: 8,
          confirmationNumber: "BTL-11200",
        },
      ],
      itinerary: [
        {
          id: "itn-006-01",
          date: addDaysToISO(t0, 4),
          startTime: "13:30",
          type: "arrival_transfer",
          title: "Delhi to Varanasi transit",
          location: "Delhi → Varanasi",
          durationMinutes: 90,
        },
        {
          id: "itn-006-02",
          date: addDaysToISO(t0, 5),
          startTime: "05:00",
          type: "activity",
          title: "Ganga Aarti and sunrise boat excursion",
          location: "Dashashwamedh Ghat, Varanasi",
          durationMinutes: 180,
        },
        {
          id: "itn-006-03",
          date: addDaysToISO(t0, 5),
          startTime: "09:00",
          type: "sightseeing",
          title: "Sarnath — Dhamek Stupa and Mulagandhakuti Vihara",
          location: "Sarnath, Varanasi",
          durationMinutes: 300,
        },
        {
          id: "itn-006-04",
          date: addDaysToISO(t0, 6),
          startTime: "07:00",
          type: "activity",
          title: "Morning Ghat heritage walk",
          location: "Varanasi ghats",
          durationMinutes: 180,
        },
        {
          id: "itn-006-05",
          date: addDaysToISO(t0, 7),
          startTime: "09:00",
          type: "sightseeing",
          title: "Kashi Vishwanath Temple precinct visit",
          location: "Varanasi",
          durationMinutes: 240,
        },
        {
          id: "itn-006-06",
          date: addDaysToISO(t0, 8),
          startTime: "07:00",
          type: "transfer",
          title: "Varanasi to Bodhgaya (road transit)",
          location: "Varanasi → Bodhgaya",
          durationMinutes: 360,
        },
        {
          id: "itn-006-07",
          date: addDaysToISO(t0, 9),
          startTime: "07:00",
          type: "activity",
          title: "Mahabodhi Temple morning prayer and circumambulation",
          location: "Bodhgaya",
          durationMinutes: 240,
        },
        {
          id: "itn-006-08",
          date: addDaysToISO(t0, 10),
          startTime: "09:00",
          type: "sightseeing",
          title: "Sujata Kuti and Dungeswari Cave Temples",
          location: "Bodhgaya",
          durationMinutes: 300,
        },
        {
          id: "itn-006-09",
          date: addDaysToISO(t0, 11),
          startTime: "13:00",
          type: "departure_transfer",
          title: "Bodhgaya to Varanasi airport",
          location: "Bodhgaya → Varanasi (VNS)",
          durationMinutes: 180,
        },
      ],
      assignments: [
        {
          id: "asn-006a",
          role: "guide",
          status: "assigned",
          name: "Dinesh Mishra",
          reference: "GD-UP-021",
          notes: "Specializes in Buddhist pilgrimage circuits and Japanese translation.",
        },
        {
          id: "asn-006b",
          role: "driver",
          status: "assigned",
          name: "Rajiv Tripathi",
          reference: "DRV-UP-007",
        },
        {
          id: "asn-006c",
          role: "vehicle",
          status: "assigned",
          reference: "UP-32-CD-9876",
          notes: "Tempo Traveller — 18-seater",
        },
      ],
      specialRequests: [
        {
          id: "sr-006a",
          category: "dietary",
          description: "Vegetarian meals requested for all group members.",
          resolved: true,
        },
        {
          id: "sr-006b",
          category: "accommodation",
          description: "Single-gender room distribution requested.",
          resolved: true,
        },
      ],
      operationalNotes:
        "All bookings confirmed. Guide briefed on pilgrimage etiquette. Temple permissions confirmed.",
    },
  ];
}

/**
 * Backward-compatible static snapshot evaluated for current Asia/Kolkata date.
 */
export const MOCK_TOURS: Tour[] = getMockTours();

// ─── Derived dashboard data ──────────────────────────────────────────────────

/**
 * Compute dashboard metrics from the mock tour dataset relative to a reference date.
 * Defaults to current India date.
 */
export function computeDashboardMetrics(
  referenceDate: string = getIndiaTodayISO()
): DashboardMetrics {
  const today = referenceDate;
  const tours = getMockTours(today);

  const arrivalsToday = tours.filter(
    (t) => t.arrivalDate === today && t.status !== "cancelled"
  ).length;

  const departuresToday = tours.filter(
    (t) => t.departureDate === today && t.status !== "cancelled"
  ).length;

  const activeToday = tours.filter(
    (t) =>
      t.status === "active" &&
      t.arrivalDate <= today &&
      t.departureDate >= today
  ).length;

  const requireAttention = tours.filter(
    (t) => t.status === "attention"
  ).length;

  return { arrivalsToday, departuresToday, activeToday, requireAttention };
}

/**
 * Derive attention items — tours that need immediate action relative to referenceDate.
 */
export function getAttentionItems(
  referenceDate: string = getIndiaTodayISO()
): AttentionItem[] {
  return getMockTours(referenceDate)
    .filter((t) => t.status === "attention")
    .map((t) => ({
      tourId: t.id,
      bookingReference: t.bookingReference,
      groupName: t.group.groupName,
      reason: t.operationalNotes ?? "Requires attention — see tour record.",
    }));
}

/**
 * Tours arriving within the next N days from referenceDate (inclusive of today).
 */
export function getUpcomingArrivals(
  days = 10,
  referenceDate: string = getIndiaTodayISO()
): Tour[] {
  const today = referenceDate;
  const toDate = addDaysToISO(today, days);
  const tours = getMockTours(today);

  return tours
    .filter((t) => {
      return (
        t.arrivalDate >= today &&
        t.arrivalDate <= toDate &&
        t.status !== "cancelled" &&
        t.status !== "completed"
      );
    })
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
}

/**
 * Retrieve a single tour by ID relative to referenceDate.
 */
export function getTourById(
  id: string,
  referenceDate: string = getIndiaTodayISO()
): Tour | undefined {
  return getMockTours(referenceDate).find((t) => t.id === id);
}
