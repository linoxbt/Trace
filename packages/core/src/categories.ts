// What kinds of job Trace takes: on-site work a camera can check, paid in
// stages. Each type names its two sides in its own words and starts the scope
// from lines that are known to photograph well. Pure data, safe in the browser.

export const JOB_CATEGORIES = ["home_repair", "cleaning", "car", "garden", "moving", "install", "events"] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export function isJobCategory(v: unknown): v is JobCategory {
  return typeof v === "string" && (JOB_CATEGORIES as readonly string[]).includes(v);
}

export interface LineTemplate {
  title: string;
  priceCents: number;
  criterion: string;
  mustShow: string[];
  mustNotShow: string[];
  framing: string;
}

export interface CategoryInfo {
  id: JobCategory;
  label: string;
  /** One line under the label in the picker. */
  blurb: string;
  /** The person paying, and the person doing the work. */
  client: string;
  pro: string;
  place: { label: string; placeholder: string };
  templates: LineTemplate[];
}

const SAME = "Same angle and distance as the before-photo";

export const CATEGORIES: Record<JobCategory, CategoryInfo> = {
  home_repair: {
    id: "home_repair",
    label: "Home repair",
    blurb: "Plumbing, tiling, carpentry, painting",
    client: "homeowner",
    pro: "tradesperson",
    place: { label: "Job address", placeholder: "12 Admiralty Way, Lekki" },
    templates: [
      { title: "Fix dripping tap", priceCents: 12000, criterion: "The tap is closed and the spout is dry", mustShow: ["tap closed with a dry spout"], mustNotShow: ["water drops at the spout"], framing: SAME },
      { title: "Reseal bath edge", priceCents: 9000, criterion: "A continuous sealant bead runs along the bath edge", mustShow: ["continuous white sealant bead"], mustNotShow: ["gaps or mould in the bead"], framing: SAME },
      { title: "Regrout shower wall", priceCents: 11000, criterion: "Every joint on the wall is filled with grout", mustShow: ["continuous grout in every joint"], mustNotShow: ["visible cracks in the grout"], framing: SAME },
      { title: "Paint feature wall", priceCents: 15000, criterion: "The wall is evenly painted edge to edge", mustShow: ["even colour across the whole wall"], mustNotShow: ["patches of the old colour", "paint on the ceiling or skirting"], framing: "Whole wall in frame, from the doorway" },
    ],
  },
  cleaning: {
    id: "cleaning",
    label: "Cleaning and turnovers",
    blurb: "End-of-tenancy, holiday lets, deep cleans",
    client: "client",
    pro: "cleaner",
    place: { label: "Property address", placeholder: "Flat 4, 9 Bourdillon Road, Ikoyi" },
    templates: [
      { title: "Kitchen deep clean", priceCents: 8000, criterion: "Worktops, hob and sink are clean and clear", mustShow: ["clear worktops", "clean hob with no grease"], mustNotShow: ["food residue", "dirty dishes"], framing: "Whole kitchen from the doorway, lights on" },
      { title: "Bathroom clean", priceCents: 6000, criterion: "Toilet, basin and shower are clean", mustShow: ["clean basin and toilet", "clear shower tray"], mustNotShow: ["limescale marks", "hair in the drain"], framing: SAME },
      { title: "Oven clean", priceCents: 5000, criterion: "The inside of the oven is free of grease", mustShow: ["clean oven floor and walls"], mustNotShow: ["burnt-on grease"], framing: "Oven door open, light on, straight in" },
      { title: "Floors vacuumed and mopped", priceCents: 4000, criterion: "Floors in every room are clear and clean", mustShow: ["clear floor"], mustNotShow: ["visible dirt or debris"], framing: "Each room from its doorway" },
      { title: "Beds made, fresh linen", priceCents: 3000, criterion: "Every bed is made with fresh linen", mustShow: ["neatly made bed"], mustNotShow: ["stained or crumpled linen"], framing: "Whole bed in frame" },
    ],
  },
  car: {
    id: "car",
    label: "Car repair and detailing",
    blurb: "Bodywork, valeting, tyres, servicing",
    client: "car owner",
    pro: "mechanic",
    place: { label: "Where the car will be", placeholder: "Workshop, 3 Ozumba Mbadiwe Avenue" },
    templates: [
      { title: "Fix bumper dent", priceCents: 18000, criterion: "The bumper panel is smooth with no dent", mustShow: ["smooth bumper surface"], mustNotShow: ["visible dent or crease"], framing: SAME },
      { title: "Full exterior valet", priceCents: 6000, criterion: "The paintwork is clean all round", mustShow: ["clean, glossy paintwork"], mustNotShow: ["dirt streaks", "bird droppings"], framing: "Front three-quarter view, whole car in frame" },
      { title: "Interior clean", priceCents: 5000, criterion: "Seats, mats and dashboard are clean", mustShow: ["clean seats and mats"], mustNotShow: ["rubbish or crumbs", "stains on seats"], framing: "From the open driver's door" },
      { title: "Replace front tyres", priceCents: 22000, criterion: "Both front tyres are new", mustShow: ["deep tread on both front tyres"], mustNotShow: ["worn or bald tread"], framing: "Tyre tread close up, then the wheel" },
    ],
  },
  garden: {
    id: "garden",
    label: "Garden and outdoor",
    blurb: "Lawns, hedges, fencing, patios",
    client: "client",
    pro: "gardener",
    place: { label: "Property address", placeholder: "22 Glover Road, Ikoyi" },
    templates: [
      { title: "Mow and edge lawn", priceCents: 4000, criterion: "The lawn is evenly cut with neat edges", mustShow: ["evenly cut lawn", "clean lawn edges"], mustNotShow: ["long uncut patches"], framing: SAME },
      { title: "Trim hedges", priceCents: 6000, criterion: "Hedges are trimmed flat and even", mustShow: ["flat, even hedge top and sides"], mustNotShow: ["overgrown shoots"], framing: SAME },
      { title: "Repair fence panel", priceCents: 9000, criterion: "The fence panel is upright and intact", mustShow: ["upright, intact fence panel"], mustNotShow: ["broken or missing slats"], framing: SAME },
      { title: "Clear garden waste", priceCents: 5000, criterion: "No garden waste is left on site", mustShow: ["clear ground"], mustNotShow: ["piles of cuttings or bags"], framing: SAME },
    ],
  },
  moving: {
    id: "moving",
    label: "Removals and clear-outs",
    blurb: "House moves, junk removal, clearances",
    client: "client",
    pro: "mover",
    place: { label: "Collection address", placeholder: "14 Admiralty Way, Lekki" },
    templates: [
      { title: "Clear the garage", priceCents: 15000, criterion: "The garage is empty", mustShow: ["empty garage floor"], mustNotShow: ["boxes, furniture or rubbish"], framing: "Whole garage from the door" },
      { title: "Load and move furniture", priceCents: 25000, criterion: "Every room at the old address is empty", mustShow: ["empty room"], mustNotShow: ["furniture or boxes left behind"], framing: "Each room from its doorway" },
      { title: "Remove old sofa", priceCents: 4000, criterion: "The sofa is gone and the space is clear", mustShow: ["clear space where the sofa was"], mustNotShow: ["the old sofa"], framing: SAME },
    ],
  },
  install: {
    id: "install",
    label: "Installations",
    blurb: "TV mounts, appliances, lighting, solar",
    client: "client",
    pro: "installer",
    place: { label: "Install address", placeholder: "41 Admiralty Road, Lekki Phase 1" },
    templates: [
      { title: "Wall-mount TV", priceCents: 8000, criterion: "The TV is mounted level with no visible cables", mustShow: ["TV mounted level on the wall"], mustNotShow: ["hanging cables", "tilted TV"], framing: "Whole wall from across the room" },
      { title: "Fit ceiling light", priceCents: 6000, criterion: "The new light is fitted flush and switched on", mustShow: ["light fitted flush to the ceiling", "light switched on"], mustNotShow: ["exposed wires"], framing: SAME },
      { title: "Install washing machine", priceCents: 7000, criterion: "The machine is in place and connected", mustShow: ["machine level in its space", "hoses connected"], mustNotShow: ["water on the floor"], framing: "Front of the machine, then behind it" },
    ],
  },
  events: {
    id: "events",
    label: "Event set-up",
    blurb: "Staging, decor, catering set-up, clean-down",
    client: "host",
    pro: "vendor",
    place: { label: "Venue", placeholder: "Harbour Point, Victoria Island" },
    templates: [
      { title: "Set up tables and chairs", priceCents: 20000, criterion: "Every table is set with its chairs", mustShow: ["tables laid with chairs in place"], mustNotShow: ["stacked or missing chairs"], framing: "Whole room from the entrance" },
      { title: "Stage and backdrop", priceCents: 30000, criterion: "The stage and backdrop are up and lit", mustShow: ["assembled stage", "backdrop hung straight"], mustNotShow: ["loose cables across the stage"], framing: "Stage straight on from the back of the room" },
      { title: "Clean-down after", priceCents: 15000, criterion: "The venue is cleared and clean", mustShow: ["clear, clean floor"], mustNotShow: ["rubbish or leftover decor"], framing: "Whole room from the entrance" },
    ],
  },
};

export function categoryOf(id: string | null | undefined): CategoryInfo {
  return isJobCategory(id) ? CATEGORIES[id] : CATEGORIES.home_repair;
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
