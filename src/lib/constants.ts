import type { ServiceConfig } from '@/types'

export const SERVICE_CATALOG: ServiceConfig[] = [
  {
    id: 'roofing',
    name: 'Roofing',
    badge: 'Popular',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    tagline: 'Protect your home with premium roofing solutions',
    description: 'Complete residential roofing services — from full replacement to repairs and inspections.',
    features: ['Hurricane-Rated', 'Energy Efficient', '25-Year Warranty'],
    stat: { label: 'Projects Completed', value: '2,847' },
    optionGroups: [
      {
        id: 'service_type',
        label: 'Service Type',
        required: true,
        type: 'single',
        options: [
          { id: 'replace', label: 'Full Replacement' },
          { id: 'repair', label: 'Repair' },
          { id: 'inspection', label: 'Inspection Only' },
        ],
      },
      {
        // Ship #255 — multi-select per Rodolfo directive. Many homes have
        // a primary sloped material with secondary flat-roof sections
        // (shingle + flat, tile + flat, metal + flat). Multi-select lets
        // the homeowner reflect their actual roof shape. Data model
        // already supports string[] via pack_items.material.
        id: 'material',
        label: 'Roofing Material',
        required: true,
        type: 'multi',
        options: [
          { id: 'shingle', label: 'Architectural Shingle', description: 'Most affordable, 25-30 year lifespan' },
          { id: 'barrel_tile', label: 'Barrel Tile', description: 'Classic Florida look, 50+ year lifespan' },
          { id: 'metal', label: 'Standing Seam Metal', description: 'Maximum durability, 50+ years' },
          { id: 'terracotta', label: 'Terracotta Clay', description: 'Premium Mediterranean style' },
          { id: 'flat_roof', label: 'Flat Roof', description: 'Commercial-style flat roofing system' },
        ],
      },
      {
        id: 'addons',
        label: 'Add-Ons',
        required: false,
        type: 'multi',
        options: [
          { id: 'gutters', label: 'Gutter Installation' },
          { id: 'insulation', label: 'Attic Insulation' },
          { id: 'solar_prep', label: 'Solar Panel Prep' },
          { id: 'soffit_wood', label: 'Soffit Wood' },
          { id: 'fascia_wood', label: 'Fascia Wood' },
          { id: 'extra_plywood', label: 'Extra Sheet Plywood' },
        ],
      },
    ],
  },
  {
    id: 'windows_doors',
    name: 'Impact Windows & Doors',
    badge: 'Hurricane Rated',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    tagline: 'Hurricane protection with energy-saving impact glass',
    description: 'Florida building code compliant impact windows and doors for maximum protection.',
    features: ['Impact-Rated', 'UV Protection', 'Noise Reduction'],
    stat: { label: 'Windows Installed', value: '18,420' },
    optionGroups: [
      {
        id: 'products',
        label: 'Products',
        required: true,
        type: 'single',
        options: [
          { id: 'windows', label: 'Windows', subGroups: [
            { id: 'window_sizes', label: 'Window Sizes', required: false, type: 'multi' as const, options: [
              { id: '18x38', label: '18×38' },
              { id: '26x25', label: '26×25' }, { id: '26x38', label: '26×38' }, { id: '26x50', label: '26×50' }, { id: '26x62', label: '26×62' }, { id: '26x73', label: '26×73' },
              { id: '36x25', label: '36×25' }, { id: '36x38', label: '36×38' }, { id: '36x50', label: '36×50' }, { id: '36x62', label: '36×62' }, { id: '36x72', label: '36×72' },
              { id: '52x25', label: '52×25' }, { id: '52x38', label: '52×38' }, { id: '52x50', label: '52×50' }, { id: '52x62', label: '52×62' }, { id: '52x72', label: '52×72' },
              { id: '73x25', label: '73×25' }, { id: '73x38', label: '73×38' }, { id: '73x50', label: '73×50' }, { id: '73x62', label: '73×62' }, { id: '73x73', label: '73×73' },
              { id: '110x25', label: '110×25' }, { id: '110x38', label: '110×38' }, { id: '110x50', label: '110×50' }, { id: '110x62', label: '110×62' }, { id: '110x72', label: '110×72' },
            ]},
            { id: 'window_types', label: 'Window Types', required: false, type: 'single' as const, options: [
              { id: 'single_hung', label: 'Single Hung' }, { id: 'casement', label: 'Casement' }, { id: 'awning', label: 'Awning' }, { id: 'rolling', label: 'Rolling' }, { id: 'picture', label: 'Picture' },
            ]},
            { id: 'frame_colors', label: 'Frame Colors', required: false, type: 'single' as const, options: [
              { id: 'white', label: 'White' }, { id: 'bronze', label: 'Bronze' }, { id: 'black', label: 'Black' },
            ]},
            { id: 'glass_colors', label: 'Glass Colors', required: false, type: 'single' as const, options: [
              { id: 'grey_white', label: 'Grey-White', description: 'Dark Grey Tinted Glass' }, { id: 'clear_white', label: 'Clear-White', description: 'Light grey tinted' }, { id: 'clear', label: 'Clear' }, { id: 'gray', label: 'Gray', description: 'Tint color grey' }, { id: 'green', label: 'Green', description: 'Low-E Color only' },
            ]},
            { id: 'glass_types', label: 'Glass Types', required: false, type: 'single' as const, options: [
              { id: 'impact_glass', label: 'Impact Glass' }, { id: 'low_e', label: 'Low-E Glass' },
            ]},
          ]},
          { id: 'doors', label: 'Doors', subGroups: [
            { id: 'door_sizes', label: 'Door Sizes', required: false, type: 'multi' as const, options: [
              { id: '27x80', label: '27×80' }, { id: '27x96', label: '27×96' }, { id: '34x80', label: '34×80' }, { id: '34x96', label: '34×96' }, { id: '39x80', label: '39×80' }, { id: '39x96', label: '39×96' },
              { id: '60x80', label: '60×80' }, { id: '60x96', label: '60×96' }, { id: '72x80', label: '72×80' }, { id: '72x96', label: '72×96' }, { id: '96x80', label: '96×80' }, { id: '96x96', label: '96×96' },
              { id: '110x80', label: '110×80' }, { id: '110x96', label: '110×96' }, { id: '120x80', label: '120×80' }, { id: '120x96', label: '120×96' }, { id: '144x80', label: '144×80' }, { id: '144x96', label: '144×96' },
            ]},
            { id: 'door_types', label: 'Door Types', required: false, type: 'single' as const, options: [
              { id: 'entry', label: 'Entry Door' }, { id: 'french', label: 'French Door' }, { id: 'sliding_glass', label: 'Sliding Glass' }, { id: 'impact_door', label: 'Impact Door' }, { id: 'patio', label: 'Patio Door' }, { id: 'pivot', label: 'Pivot Door' },
            ]},
            { id: 'door_frame_colors', label: 'Frame Colors', required: false, type: 'single' as const, options: [
              { id: 'white', label: 'White' }, { id: 'bronze', label: 'Bronze' }, { id: 'black', label: 'Black' },
            ]},
            { id: 'door_glass_colors', label: 'Glass Colors', required: false, type: 'single' as const, options: [
              { id: 'grey_white', label: 'Grey-White' }, { id: 'clear_white', label: 'Clear-White' }, { id: 'clear', label: 'Clear' }, { id: 'gray', label: 'Gray' }, { id: 'green', label: 'Green' },
            ]},
            { id: 'door_glass_types', label: 'Glass Types', required: false, type: 'single' as const, options: [
              { id: 'impact_glass', label: 'Impact Glass' }, { id: 'low_e', label: 'Low-E Glass' },
            ]},
          ]},
          { id: 'garage_doors', label: 'Garage Doors', subGroups: [
            { id: 'garage_door_type', label: 'Garage Door Type', required: false, type: 'single' as const, options: [
              { id: 'single_garage', label: 'Single Garage Door' },
              { id: 'double_garage', label: 'Double Garage Door' },
            ]},
            { id: 'garage_door_size', label: 'Garage Door Size', required: false, type: 'single' as const, options: [
              { id: 'gd_4_panels', label: '4 Panels' },
              { id: 'gd_5_panels', label: '5 Panels' },
            ]},
            { id: 'garage_door_color', label: 'Garage Door Color', required: false, type: 'single' as const, options: [
              { id: 'gd_bronze', label: 'Bronze' },
              { id: 'gd_white', label: 'White' },
              { id: 'gd_black', label: 'Black' },
            ]},
            { id: 'garage_door_glass', label: 'Garage Door Glass Color', required: false, type: 'single' as const, options: [
              { id: 'gd_grey_white', label: 'Grey-White' },
              { id: 'gd_clear_white', label: 'Clear-White' },
              { id: 'gd_grey', label: 'Grey' },
              { id: 'gd_clear', label: 'Clear' },
            ]},
          ]},
        ],
      },
      {
        id: 'scope',
        label: 'Preferences',
        required: true,
        type: 'single',
        options: [
          { id: 'permit', label: 'Permit' },
          { id: 'no_permit', label: 'No Permit' },
        ],
      },
      {
        id: 'installation',
        label: 'Installation',
        required: true,
        type: 'single',
        options: [
          { id: 'install', label: 'Install' },
          { id: 'no_install', label: 'No Install' },
        ],
      },
      {
        id: 'install_products',
        label: 'Install for',
        required: true,
        type: 'multi',
        revealsOn: { group: 'installation', equals: 'install' },
        options: [
          { id: 'install_windows', label: 'Install Windows' },
          { id: 'install_doors', label: 'Install Doors' },
        ],
      },
      {
        id: 'payment',
        label: 'Payment Method',
        required: true,
        type: 'single',
        options: [
          { id: 'financed', label: 'Financed' },
          { id: 'cash', label: 'Cash' },
        ],
      },
    ],
  },
  {
    id: 'pool',
    name: 'Pool & Oasis',
    tagline: 'Your backyard paradise, designed and built',
    description: 'Custom pool design and construction with premium finishes and water features.',
    features: ['Custom Design', 'Smart Controls', 'Eco-Friendly'],
    stat: { label: 'Pools Built', value: '1,203' },
    optionGroups: [
      {
        id: 'project_type',
        label: 'Is this a new pool or a remodel?',
        required: true,
        type: 'single',
        options: [
          { id: 'new_pool', label: 'New Pool' },
          { id: 'remodel', label: 'Remodel' },
        ],
      },
      {
        id: 'pool_size',
        label: 'Pool Size',
        required: true,
        type: 'single',
        options: [
          { id: '10x20', label: '10×20' },
          { id: '12x24', label: '12×24' },
          { id: '15x30', label: '15×30' },
          { id: '20x40', label: '20×40' },
          { id: 'custom', label: 'Custom Size' },
        ],
      },
      {
        id: 'pool_floor',
        label: 'Pool Floor',
        required: true,
        type: 'single',
        options: [
          { id: 'travertine', label: 'Travertine' },
          { id: 'pavers', label: 'Pavers' },
          { id: 'stamped_concrete', label: 'Stamped Concrete' },
          { id: 'cement_floor', label: 'Cement Floor' },
          { id: 'artificial_turf', label: 'Artificial Turf' },
          { id: 'na', label: 'N/A' },
        ],
      },
      {
        id: 'addons',
        label: 'Add-Ons',
        required: false,
        type: 'multi',
        options: [
          { id: 'spa', label: 'Attached Spa' },
          { id: 'beach', label: 'Beach' },
          { id: 'waterfall', label: 'Water Feature' },
          { id: 'led', label: 'LED Lighting' },
          { id: 'bubbler', label: 'Bubbler' },
          { id: 'heater', label: 'Pool Heater' },
        ],
      },
      {
        id: 'spa_size',
        label: 'Spa Size',
        required: false,
        type: 'single',
        options: [
          { id: 'spa_7x7', label: '7×7' },
          { id: 'spa_10x10', label: '10×10' },
          { id: 'spa_12x7', label: '12×7' },
          { id: 'spa_15x7', label: '15×7' },
          { id: 'spa_custom', label: 'Custom Size' },
        ],
      },
      {
        id: 'beach_size',
        label: 'Beach Size',
        required: false,
        type: 'single',
        options: [
          { id: 'beach_7x7', label: '7×7' },
          { id: 'beach_12x7', label: '12×7' },
          { id: 'beach_15x7', label: '15×7' },
          { id: 'beach_custom', label: 'Custom Size' },
        ],
      },
    ],
  },
  {
    id: 'driveways',
    name: 'Driveways',
    tagline: 'Make a lasting first impression',
    description: 'Premium driveway installation and resurfacing for curb appeal that lasts.',
    features: ['Weather-Proof', 'Low Maintenance', 'Custom Patterns'],
    stat: { label: 'Driveways Paved', value: '956' },
    optionGroups: [
      {
        id: 'scope',
        label: 'Scope',
        required: true,
        type: 'single',
        options: [
          { id: 'full', label: 'Full Driveway' },
          { id: 'overlay', label: 'Overlay' },
          { id: 'repair', label: 'Repair Only' },
        ],
      },
      {
        id: 'surface',
        label: 'Surface Material',
        required: true,
        type: 'single',
        options: [
          { id: 'pavers', label: 'Interlocking Pavers' },
          { id: 'stamped', label: 'Stamped Concrete' },
          { id: 'asphalt', label: 'Asphalt' },
          { id: 'stone', label: 'Natural Stone' },
        ],
      },
      {
        id: 'addons',
        label: 'Add-Ons',
        required: false,
        type: 'multi',
        options: [
          { id: 'border', label: 'Decorative Border' },
          { id: 'lighting', label: 'Driveway Lighting' },
          { id: 'drainage', label: 'Drainage System' },
        ],
      },
    ],
  },
  {
    id: 'pergolas',
    name: 'Pergolas & Terraces',
    badge: 'Trending',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    tagline: 'Extend your living space outdoors',
    description: 'Custom outdoor structures for shade, style, and year-round entertainment.',
    features: ['Weather-Resistant', 'Motorized Options', 'Custom Sizes'],
    stat: { label: 'Structures Built', value: '734' },
    optionGroups: [
      {
        id: 'structure',
        label: 'Structure Type',
        required: true,
        type: 'single',
        options: [
          { id: 'aluminum', label: 'Aluminum Pergola' },
          { id: 'wood', label: 'Wood Beam Pergola' },
          { id: 'louvered', label: 'Louvered Roof' },
        ],
      },
      {
        id: 'size',
        label: 'Size',
        required: true,
        type: 'single',
        options: [
          { id: '10x12', label: '10×12 ft' },
          { id: '12x16', label: '12×16 ft' },
          { id: 'custom', label: 'Custom Size' },
        ],
      },
      {
        id: 'addons',
        label: 'Add-Ons',
        required: false,
        type: 'multi',
        options: [
          { id: 'fans', label: 'Ceiling Fans' },
          { id: 'kitchen', label: 'Outdoor Kitchen' },
          { id: 'deck', label: 'Composite Deck' },
          { id: 'screen', label: 'Screen Enclosure' },
        ],
      },
    ],
  },
  {
    id: 'air_conditioning',
    name: 'Air Conditioning',
    badge: 'Essential',
    badgeColor: 'bg-primary/15 text-primary',
    tagline: 'Stay cool with efficient climate control',
    description: 'HVAC installation, replacement, and maintenance for South Florida homes.',
    features: ['Energy Star', 'Smart Thermostat', '10-Year Warranty'],
    stat: { label: 'Systems Installed', value: '4,312' },
    optionGroups: [
      {
        id: 'system',
        label: 'System Type',
        required: true,
        type: 'single',
        options: [
          { id: 'central_2', label: 'Central AC — 2 Ton' },
          { id: 'central_3', label: 'Central AC — 3 Ton' },
          { id: 'central_4', label: 'Central AC — 4 Ton' },
          { id: 'mini_single', label: 'Mini-Split — Single Zone' },
          { id: 'mini_multi', label: 'Mini-Split — Multi Zone' },
        ],
      },
      {
        id: 'addons',
        label: 'Add-Ons',
        required: false,
        type: 'multi',
        options: [
          { id: 'thermostat', label: 'Smart Thermostat' },
          { id: 'ducts', label: 'Duct Cleaning/Replacement' },
          { id: 'purifier', label: 'Air Purifier' },
          { id: 'maintenance', label: 'Annual Maintenance Plan' },
        ],
      },
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen Remodel',
    badge: 'Coming Soon',
    badgeColor: 'bg-muted text-muted-foreground',
    tagline: 'Transform your kitchen into the heart of your home',
    description: 'Full kitchen renovations from cabinets to countertops to appliances.',
    features: ['Custom Cabinets', 'Quartz Counters', 'Smart Appliances'],
    stat: { label: 'Kitchens Remodeled', value: '—' },
    phase2: true,
    optionGroups: [],
  },
  {
    id: 'bathroom',
    name: 'Bathroom Remodel',
    badge: 'Coming Soon',
    badgeColor: 'bg-muted text-muted-foreground',
    tagline: 'Create your personal spa retreat',
    description: 'Modern bathroom renovations with premium fixtures and finishes.',
    features: ['Walk-In Shower', 'Heated Floors', 'Smart Fixtures'],
    stat: { label: 'Bathrooms Remodeled', value: '—' },
    phase2: true,
    optionGroups: [],
  },
  {
    id: 'wall_paneling',
    name: 'Wall Paneling & Design',
    badge: 'New',
    badgeColor: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    tagline: 'Elevate your interiors with designer wall treatments',
    description: 'Custom wall paneling, accent walls, and interior design treatments.',
    features: ['Designer Styles', 'Quick Install', 'Eco Materials'],
    stat: { label: 'Walls Designed', value: '412' },
    optionGroups: [
      {
        id: 'style',
        label: 'Panel Style',
        required: true,
        type: 'single',
        options: [
          { id: 'shiplap', label: 'Shiplap' },
          { id: 'board_batten', label: 'Board & Batten' },
          { id: '3d', label: '3D Panels' },
          { id: 'wainscoting', label: 'Wainscoting' },
        ],
      },
      {
        id: 'rooms',
        label: 'Rooms',
        required: true,
        type: 'multi',
        options: [
          { id: 'living', label: 'Living Room' },
          { id: 'bedroom', label: 'Bedroom' },
          { id: 'dining', label: 'Dining Room' },
          { id: 'entryway', label: 'Entryway' },
          { id: 'office', label: 'Home Office' },
        ],
      },
    ],
  },
  {
    id: 'garage',
    name: 'Interior Remodel',
    tagline: 'Refresh any room from studs to finish',
    description: 'Drywall, flooring, lighting, and interior finish work — transform any room without a whole-house teardown.',
    features: ['Drywall', 'Recessed Lighting', 'Flooring'],
    stat: { label: 'Rooms Finished', value: '287' },
    optionGroups: [
      {
        id: 'rooms',
        label: 'Which room(s)?',
        required: true,
        type: 'multi',
        options: [
          { id: 'living_family', label: 'Living / Family Room' },
          { id: 'bedroom', label: 'Bedroom' },
          { id: 'office_den', label: 'Office / Den' },
          { id: 'hallway_stairway', label: 'Hallway or Stairway' },
          { id: 'foyer_entry', label: 'Foyer / Entry' },
          { id: 'dining', label: 'Dining Room' },
          { id: 'whole_home', label: 'Whole home' },
          { id: 'other', label: 'Other' },
        ],
      },
      {
        id: 'scope',
        label: "What's included?",
        required: true,
        type: 'multi',
        options: [
          { id: 'drywall', label: 'Drywall / sheetrock' },
          { id: 'ceiling', label: 'Ceiling work' },
          { id: 'recessed_lighting', label: 'Recessed lighting' },
          { id: 'flooring', label: 'Flooring installation' },
          { id: 'trim_molding', label: 'Trim & molding' },
          { id: 'interior_doors', label: 'Interior doors' },
          { id: 'move_walls', label: 'Move or remove walls' },
          { id: 'paint', label: 'Paint' },
          { id: 'builtins', label: 'Built-ins / cabinetry' },
        ],
      },
      {
        id: 'size',
        label: 'Room size',
        required: true,
        type: 'single',
        options: [
          { id: 'small', label: 'Small (under 200 sq ft)' },
          { id: 'medium', label: 'Medium (200–400 sq ft)' },
          { id: 'large', label: 'Large (400–600 sq ft)' },
          { id: 'xlarge', label: 'Extra large (600+)' },
          { id: 'whole_home', label: 'Whole home' },
        ],
      },
      {
        id: 'finish',
        label: 'Finish level',
        required: true,
        type: 'single',
        options: [
          { id: 'standard', label: 'Standard' },
          { id: 'premium', label: 'Premium' },
          { id: 'custom', label: 'Custom / designer-grade' },
        ],
      },
      {
        id: 'addons',
        label: 'Add-ons',
        required: false,
        type: 'multi',
        options: [
          { id: 'closet_system', label: 'Closet system' },
          { id: 'crown_molding', label: 'Crown molding' },
          { id: 'accent_wall', label: 'Accent wall' },
          { id: 'smart_lighting', label: 'Smart lighting / switches' },
          { id: 'skylight', label: 'Skylight' },
          { id: 'popcorn_removal', label: 'Popcorn ceiling removal' },
        ],
      },
    ],
  },
  {
    id: 'house_painting',
    name: 'House Painting',
    tagline: 'Fresh coat, new look',
    description: 'Professional interior and exterior painting — pick your colors, we handle the rest.',
    features: ['Interior', 'Exterior', 'Color Consultation'],
    stat: { label: 'Homes Painted', value: '940' },
    optionGroups: [
      {
        id: 'height',
        label: 'How tall is the house?',
        required: true,
        type: 'single',
        options: [
          { id: 'one_story', label: 'One story' },
          { id: 'two_story', label: 'Two story' },
        ],
      },
      {
        id: 'scope',
        label: 'Inside, outside, or both?',
        required: true,
        type: 'single',
        options: [
          { id: 'exterior_only', label: 'Exterior only' },
          { id: 'interior_only', label: 'Interior only' },
          { id: 'both', label: 'Both inside and outside' },
        ],
      },
      {
        id: 'rooms',
        label: 'How many rooms?',
        required: false,
        type: 'single',
        options: [
          { id: 'one_room', label: '1 room' },
          { id: 'two_to_three', label: '2–3 rooms' },
          { id: 'four_to_five', label: '4–5 rooms' },
          { id: 'whole_interior', label: 'Whole interior' },
        ],
      },
      {
        id: 'colors',
        label: 'Colors',
        required: true,
        type: 'single',
        options: [
          { id: 'single_color', label: 'Single color, whole house' },
          { id: 'two_tone', label: 'Two-tone (body + trim)' },
          { id: 'multi_color', label: 'Multi-color (body, trim, accents)' },
          { id: 'custom_palette', label: 'Custom palette — work with a color pro' },
        ],
      },
    ],
  },
  {
    // Ship #260 — Blinds as 12th service. Residential window-treatment
    // coverage across common buying-decisions: type (multi — homes often
    // mix types across rooms), material, control mechanism, mount style,
    // light-control opacity. Prices set vendor-side via /admin/products
    // or Supabase catalog; SERVICE_CATALOG defines shape only.
    id: 'blinds',
    name: 'Blinds',
    tagline: 'Custom window treatments for every room',
    description: 'Roller, venetian, roman, cellular, vertical, blackout, motorized — multiple materials, mount styles, and light-control options for residential applications.',
    features: ['Cordless Available', 'Energy Efficient', 'Custom Fit'],
    stat: { label: 'Homes Dressed', value: '1,240' },
    optionGroups: [
      {
        // Multi — homes commonly mix blind types across rooms (roller in
        // kitchen, blackout in bedroom, motorized in living room).
        id: 'type',
        label: 'Blind Type',
        required: true,
        type: 'multi',
        options: [
          { id: 'roller', label: 'Roller Shades', description: 'Clean, modern, affordable — most common' },
          { id: 'venetian', label: 'Venetian Blinds', description: 'Horizontal slats, classic look' },
          { id: 'roman', label: 'Roman Shades', description: 'Fabric folds, upscale' },
          { id: 'cellular', label: 'Cellular / Honeycomb', description: 'Energy-efficient insulation' },
          { id: 'vertical', label: 'Vertical Blinds', description: 'Sliding doors, wide windows' },
          { id: 'blackout', label: 'Blackout Shades', description: 'Bedrooms, media rooms — total darkness' },
          { id: 'motorized', label: 'Motorized / Smart', description: 'Remote + app control, premium' },
        ],
      },
      {
        id: 'material',
        label: 'Material',
        required: true,
        type: 'single',
        options: [
          { id: 'fabric', label: 'Fabric', description: 'Soft, customizable, living-room feel' },
          { id: 'vinyl', label: 'Vinyl', description: 'Moisture-resistant — bathrooms, kitchens' },
          { id: 'faux_wood', label: 'Faux Wood', description: 'Wood look + moisture-resistant' },
          { id: 'real_wood', label: 'Real Wood', description: 'Natural, premium' },
          { id: 'aluminum', label: 'Aluminum', description: 'Modern, durable, slim profile' },
          { id: 'bamboo', label: 'Bamboo', description: 'Eco-friendly, organic texture' },
        ],
      },
      {
        id: 'control',
        label: 'Control Type',
        required: true,
        type: 'single',
        options: [
          { id: 'cordless', label: 'Cordless', description: 'Child-safe — recommended default' },
          { id: 'traditional_cord', label: 'Traditional Cord', description: 'Classic pull-cord' },
          { id: 'wand', label: 'Wand', description: 'Tilt wand for slat-based blinds' },
          { id: 'motorized', label: 'Motorized', description: 'Remote or app control' },
        ],
      },
      {
        id: 'mount',
        label: 'Mount Style',
        required: true,
        type: 'single',
        options: [
          { id: 'inside_mount', label: 'Inside Mount', description: 'Flush inside the window frame — cleaner look' },
          { id: 'outside_mount', label: 'Outside Mount', description: 'Covers the frame — blocks more light' },
        ],
      },
      {
        id: 'light_control',
        label: 'Light Control',
        required: true,
        type: 'single',
        options: [
          { id: 'blackout', label: 'Blackout', description: 'Total light block' },
          { id: 'room_darkening', label: 'Room Darkening', description: 'Most light blocked, softer than blackout' },
          { id: 'light_filtering', label: 'Light Filtering', description: 'Diffuses light, maintains privacy' },
          { id: 'sheer', label: 'Sheer', description: 'Lets light through, minimal privacy' },
        ],
      },
    ],
  },
]

export const LEAD_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: '⏳' },
  // Display label 'Scheduled' — the underlying status enum stays 'confirmed' everywhere
  // (DB, zustand actions, filter predicates). Display-only rename per kratos msg 1776577149412.
  // confirmed → sky/light-blue to match the /home Upcoming-row visual
  // legend (ship #121). Homeowner appointment-status page overrides
  // label to 'Approved'; shared default label stays 'Scheduled'.
  confirmed: { label: 'Scheduled', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400', icon: '✓' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: '🚫' },
  rescheduled: { label: 'Rescheduled', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: '🔄' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400', icon: '☑️' },
  // Ship #171 — distinct from rejected. Homeowner-initiated cancellation
  // that the vendor approved; visually softer than red 'rejected' to
  // signal "mutual outcome" rather than "vendor said no up front."
  cancelled: { label: 'Cancelled', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300', icon: '✕' },
}
