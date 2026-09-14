export const TOWN_NAMES: readonly string[] = [
  'Ashford', 'Barrowdale', 'Brightwater', 'Cinderfall', 'Coldharbour', 'Copperhill', 'Dunmore', 'Eastmere',
  'Elderbrook', 'Fairhaven', 'Fallowfield', 'Foxglove', 'Glenridge', 'Goldmarsh', 'Greywick', 'Halloway',
  'Harrowgate', 'Hazelden', 'Highbury', 'Hollowmere', 'Ironbridge', 'Kingsford', 'Larkspur', 'Linwood',
  'Marlow', 'Millbrook', 'Moorland', 'Netherby', 'Northam', 'Oakhurst', 'Oldcastle', 'Pembury',
  'Quarryford', 'Ravensmoor', 'Redcliffe', 'Rushwater', 'Saltmarsh', 'Silverton', 'Stonebridge', 'Sunderby',
  'Thornbury', 'Tidewell', 'Underhill', 'Vale End', 'Waterford', 'Westmoor', 'Whitby', 'Willowdale',
  'Wolfden', 'Yarrow', 'Amberly', 'Blackpool', 'Bramwell', 'Castleton', 'Clearwater', 'Danby',
  'Ellsworth', 'Fenwick', 'Grimsby', 'Holloway', 'Kirkwall', 'Lambton', 'Mayfield', 'Norwood',
  'Overton', 'Penrose', 'Rockhaven', 'Southmere', 'Tanglewood', 'Upton', 'Verity', 'Wexford',
  'Aldergrove', 'Beacon Hill', 'Cobblestone', 'Driftwood', 'Emberton', 'Frostmere', 'Gallowsend', 'Hearthstone',
  'Ivybridge', 'Juniper', 'Kestrel Bay', 'Lowick', 'Mistvale', 'Nettlecombe', 'Ottery', 'Pinecrest',
  'Quillford', 'Rosewood', 'Seabrook', 'Tarnwick', 'Ulverston', 'Vixenholt', 'Wyndham', 'Yewdale',
];

const INDUSTRY_PREFIX: readonly string[] = [
  'North', 'South', 'East', 'West', 'Old', 'New', 'Upper', 'Lower', 'Great', 'Little', 'High', 'Low',
];

export function industryName(townName: string, kind: string, idx: number): string {
  const p = INDUSTRY_PREFIX[idx % INDUSTRY_PREFIX.length];
  return `${p} ${townName} ${kind}`;
}
