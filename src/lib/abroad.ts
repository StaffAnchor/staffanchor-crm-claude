// Is this city outside India? A plain lookup of well-known places and countries, so the call list can leave out
// people who are not in the country the roles are in. A city that is not recognised counts as "not known to be
// abroad", never as abroad: this only flags what it is sure of.

const ABROAD = [
  // Gulf and Middle East
  "dubai", "abu dhabi", "sharjah", "ajman", "uae", "united arab emirates", "doha", "qatar", "riyadh", "jeddah", "dammam", "saudi", "kuwait", "manama", "bahrain", "muscat", "oman", "tel aviv", "istanbul",
  // Africa
  "nairobi", "kenya", "lagos", "abuja", "nigeria", "accra", "ghana", "johannesburg", "cape town", "south africa", "cairo", "egypt", "kampala", "uganda", "dar es salaam", "tanzania", "addis ababa", "ethiopia", "kigali", "rwanda",
  // Europe
  "london", "manchester", "birmingham", "edinburgh", "united kingdom", "uk", "england", "scotland", "dublin", "ireland", "paris", "france", "berlin", "munich", "frankfurt", "hamburg", "germany", "amsterdam", "netherlands", "madrid", "barcelona", "spain", "lisbon", "portugal", "rome", "milan", "italy", "zurich", "geneva", "switzerland", "stockholm", "sweden", "oslo", "norway", "copenhagen", "denmark", "helsinki", "finland", "warsaw", "poland", "prague", "vienna", "austria", "brussels", "belgium", "bucharest", "romania", "moldova", "kyiv", "ukraine",
  // Americas
  "new york", "san francisco", "los angeles", "san diego", "san jose", "seattle", "austin", "boston", "chicago", "dallas", "houston", "atlanta", "miami", "denver", "washington dc", "california", "texas", "encinitas", "usa", "united states", "u.s.", "toronto", "vancouver", "montreal", "ottawa", "calgary", "canada", "mexico", "sao paulo", "brazil", "buenos aires", "bogota",
  // Asia Pacific
  "singapore", "kuala lumpur", "malaysia", "jakarta", "indonesia", "manila", "philippines", "bangkok", "thailand", "ho chi minh", "hanoi", "vietnam", "hong kong", "shanghai", "beijing", "shenzhen", "china", "tokyo", "osaka", "japan", "seoul", "south korea", "taipei", "taiwan", "sydney", "melbourne", "brisbane", "perth", "australia", "auckland", "wellington", "new zealand", "colombo", "sri lanka", "dhaka", "bangladesh", "kathmandu", "nepal", "karachi", "lahore", "islamabad", "pakistan",
];

const PATTERN = new RegExp(`(^|[^a-z])(${ABROAD.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})([^a-z]|$)`, "i");

/** True only when the place is clearly outside India. */
export function isAbroad(place: string | null | undefined): boolean {
  const p = (place ?? "").trim();
  return p.length > 1 && PATTERN.test(p);
}
