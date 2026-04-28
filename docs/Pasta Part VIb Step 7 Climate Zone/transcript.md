# Climate Cookbook — Step 7: Climate Zones

*Source: worldbuildingpasta.blogspot.com (screenshot dated 28-4-2026)*

---

## Step 7: Climate Zones

The precipitation data in the last step isn't precise enough to map out all out climate zones, but it can gives us some good guidelines to work some.

First off, our **tundra (*ET*)** and **ice cap (*EF*)** zones can be left untouched; precipitation matters little in these cold climates, though we can generally expect them to be fairly dry.

**[画像 01: 01_step_tundra_icecap.jpeg]**

Next, we'll deal with the arid regions in the remaining land; those that are *dry* in both *summer* and *winter*. These will be Group *B* climates: **desert (*Bw*)** or **steppe (*Bs*)**.

We can mark them as desert by default, and then fill in the edges with steppe; there should always be some steppe between deserts and other climate zones (but there need not be steppe between deserts and the sea). On flat ground, the steppe will appear in boundary strips about 100‑300 km wide in the tropics and twice as wide at higher latitudes, and small patches of arid land can be completely filled in with steppe.

In mountains the boundary thins, and on steep mountain slopes it can thin down to just a few kilometers. Low highlands with shallow slopes will tend to have the opposite effect, though, creating broader regions of steppe and patches of desert.

**[画像 02: 02_step_arid_initial.jpeg]**

Once that's done, we can divide them up by temperature: Deserts and steppes in the tropical and temperate climate bands will be **hot desert (*Bwh*)** and **hot steppe (*Bsh*)**; those in the continental band will be **cold desert (*Bwk*)** and **cold steppe (*Bsk*)**.

**[画像 03: 03_step_hot_cold_arid.jpeg]**

Remaining areas in the continental band can be left as‑is, as **humid continental (*Dsa/Dsb/Dwa/Dwb/Dfa/Dfb*)** and **subarctic (*Dsc/Dsd/Dwc/Dwd/Dfc/Dfd*)** zones.

**[画像 04: 04_step_continental.jpeg]**

Next, remaining areas in the temperate band will contain **Group *C*** climates. Mark areas that are *dry* in *summer* (but still *wet* or *very wet* in *winter*) as **mediterranean (*Csa/Csb/Csc*)**. Remaining areas (that are *wet* or *very wet* in *summer*, regardless of their condition in *winter*) will be **humid subtropical (*Cfa/Cwa*)** in the hot‑summer regions and **oceanic (*Cfb/Cfc/Cwb/Cwc*)** in the cool‑summer regions.

**[画像 05: 05_step_temperate.jpeg]**

Finally, the tropical band, which is a bit trickier. These will be **Group *A*** climates: **tropical rainforest (*Af*)**, **tropical monsoon (*Am*)**, and **tropical savanna (*Aw/As*)**.

We'll start out by marking out areas that are *very wet* in both seasons as **tropical rainforest (*Af*)**, areas that are *wet* in both seasons as **tropical monsoon (*Am*)**, and areas that are *wet* in one season and *dry* in the other as **tropical savanna (*Aw/As*)**.

**[画像 06: 06_step_tropical_initial.jpeg]**

The remaining areas will be split between zones: Areas that are *very wet* in one season and *wet* in the other will be **tropical rainforest (*Af*)** near the equator and transition to as **tropical monsoon (*Am*)** near the edges of the tropical band and arid zones. Areas that are *very wet* in one season and *dry* in the other will be **tropical monsoon (*Am*)** near coasts, mountains, and rainforests and **tropical savanna (*Aw/As*)** inland and near arid zones.

You should try to make sure that there is a continuous sequence of rainforest‑monsoon‑savanna‑arid zones (though the transition can be pretty sharp in mountains), and you can touch it up at the end to ensure this.

**[画像 07: 07_step_tropical_adjusted.jpeg]**

A couple final adjustments we can make:

- The ITCZ will pass through the areas between it's seasonal extremes, bringing rain to areas near the equator currently marked as dry. This should shrink the arid zones near the equator and expand the tropical savanna and to some extent the tropical monsoon zones, but not the rainforest, which requires high year‑round rain (and also other wet zones in areas near the equator outside the tropical band). This should create a more‑or‑less continuous wet band across the equator, except for where there are strong rainshadows.
- Conversely, the way I've handled rains near the ITCZ can cut into deserts a bit too much near the coasts. Where there are large deserts at mid‑latitude (around 20°) make sure they extend all the way to the west coast.
- Some of the high‑latitude deserts here have also come out looking a bit odd—largely because it's hard to judge distance at high latitude in this projection—so I'll go ahead and adjust those a bit as well.

**[画像 08: 08_step_final_climate_adjustments.jpeg]**

And that about wraps it up. Of course, this whole process isn't perfect, so if you end up with something that doesn't seem quite right (odd patches of desert or steppe, a dearth of Mediterranean zones, etc.) or you just want something slightly different, then by all means you can adjust the boundaries between climate zones without sacrificing much in terms of realism. Winds in the Ferrel cells in particular are pretty irregular, so this method may be a little over‑deterministic regarding precipitation at mid‑latitudes. But for my part, I think this map of Teacup Ae works just fine (though I may adjust it somewhat when I add more detailed topography).

**[画像 09: 09_final_Koppen_Ae_14zones.jpeg]** — *14ゾーン凡例付きの最終Köppen気候マップ (Ae). 凡例:*

| 大分類 | 内訳 |
|---|---|
| Tropical | Rainforest / Monsoon / Savanna |
| Arid (dry) | Hot Desert / Cold Desert / Hot Steppe / Cold Steppe |
| Temperate | Mediterranean / Subtropical / Oceanic |
| Cold (continental) | Humid Continental / Subarctic |
| Polar | Tundra / Ice Cap |
| Water | Tropical / No Ice / Seasonal Ice / Ice Caps |

---

### Optional Extensions

These 14 zones include all the most important variations in climate, and the accuracy of hand‑drawn precipitation zones is probably too low to make more granular climate zone distinctions with any confidence. But if you *really* want to have the full set of 31 Köppen climate zones, here's a procedure that should more‑or‑less work:

**Tropical Savanna (*Aw/As*)**: Even formal sources mapping Earth rarely make this distinction, but you can mark areas that are *dry* in *summer* as *As*, and leave the rest as *Aw* (though also bear in mind the extra savanna you added near the equator for where the ITCZ passes over, which should remain *Aw*).

**Mediterranean (*Csa/Csb/Csc*)**: Regions in the hot‑summer areas of the temperate band are *Csa*; regions in the cool‑summer areas are *Csb* if they are above 10 ℃ at *2 months before or after peak summer*, and *Csc* if they are not.

**Humid Subtropical (*Cfa/Cwa*)**: Regions that are *dry* in *winter* are *Cwa*, remaining regions are *Cfa*.

**Oceanic (*Cfb/Cfc/Cwb/Cwc*)**: Regions that are above 10 ℃ at *2 months before or after peak summer* are *Cfb* or *Cwb*, those not are *Cfc* or *Cwc*; Regions that are *dry* in *winter* are *Cwb* or *Cwc*, those not are *Cfb* or *Cfc*. Determine zones by overlap of these temperature and precipitation boundaries.

**Humid Continental (*Dsa/Dsb/Dwa/Dwb/Dfa/Dfb*)**: Regions that are *dry* in *summer* are *Dsa* or *Dsb*, those that are *dry* in *winter* are *Dwa* or *Dwb*, remaining areas are *Dfa* or *Dfb*. Regions that are above 22 ℃ in *summer* are *Dsa*, *Dwa*, or *Dfa*, those that are not are *Dsb*, *Dwb*, or *Dfb*.

**Subarctic (*Dsc/Dsd/Dwc/Dwd/Dfc/Dfd*)**: Regions that are *dry* in *summer* are *Dsc* or *Dsd*, those *dry* in *winter* are *Dwc* or *Dwd*, remaining areas are *Dfc* or *Dfd*. Regions that are above ‑38 ℃ in *winter* are *Dsc*, *Dwc*, or *Dfc*, those that are not are *Dsd*, *Dwd*, or *Dfd*.

Note the pattern in the letter designations here: For the second letter, *s* zones have dry summers, *w* zones have dry winters, and *f* zones have no dry season; For the third letter, *a* zones have summers above 22 ℃, *b* zones have summers above 10 ℃ extending to 2 months before or after peak summer, *c* zones have winters above ‑38 ℃, and *d* zones have colder winters.

Generally speaking, you should expect to see *Ds* zones mostly near Mediterranean zones, and *Dw* zones mostly near regions with a strong monsoon effect (where the ITCZ has moved far from the equator) so you may need to make some adjustments if you see large regions of them in odd places.

Here's the complete map of all Köppen climate zones for Ae (29 zones, as there are apparently no *Dsc* or *Dsd* zones on Teacup Ae), plus the 4 ocean zones I've added.

**[画像 10: 10_full_Koppen_31zones.jpeg]** — *全Köppenゾーン (29ゾーン) + 4海洋ゾーン. 凡例:*

| 大分類 | 細分 |
|---|---|
| Tropical | Af Rainforest / Am Monsoon / Aw, As Savanna |
| Arid (dry) | BWh Hot Desert / BWk Cold Desert / BSh Hot Steppe / BSk Cold Steppe |
| Temperate — Mediterranean | Csa / Csb / Csc |
| Temperate — Subtropical | Cwa / Cfa |
| Temperate — Oceanic | Cwb / Cfb / Cwc / Cfc |
| Cold (continental) — Humid Continental | Dsa / Dsb / Dwa / Dwb / Dfa / Dfb |
| Cold (continental) — Subarctic | Dsc / Dsd / Dwc / Dwd / Dfc / Dfd |
| Polar | ET Tundra / EF Ice Cap |
| Water | Tropical / No Ice / Seasonal Ice / Ice Caps |

---

## Impacts of Climate

Now that we've done all that, let's take a tour of these climate zones to get a feel for what kind of life we might see in them and what impact they'll have on the development of civilization (in broad strokes; I'll dig deeper into the distribution of natural resources, terrain types, and the cultural impact of climate in later posts). I'll also include the formal definitions for these zones, which I had to simplify for this tutorial, and some examples from Earth.

### A: Tropical Climates

Monthly average temperatures at least 18 ℃ year‑round.

**[画像 11: 11_world_tropical_rainforest.jpeg]** — *Earth上のTropical Rainforest分布図*

#### Tropical Rainforest (*Af*)

At least 2 mm/day of average rainfall every month of the year.

**Examples**: Central Amazon; Central Congo; Borneo; Singapore.

**Conditions**: These are hot, wet regions with no dry season. Average temperatures above 25 ℃ and rains above 10 mm/day are common. Near the equator, average temperatures are near‑constant but there are often still wet and dry seasons as the ITCZ moves. Regions nearest the center of the tropical band will have low winds and wet equinoxes with dry solstices, while further poleward regions are more influenced by strong trade winds and have a more pronounced cycle of wet summer solstice and dry winter solstice.

**[画像 12: 12_photo_Guadeloupe_rainforest.jpeg]** — *Guadeloupe. Mart.wain, Wikimedia*

**Ecology**: These are the most diverse regions of the planets; a single square kilometer can include trees from over 1,000 species. Consistent rain and sunlight support dense forests, but the rain also leaches nutrients from the soil; competition for light and nutrients amongst plant life is fierce. So little light penetrates to ground level that, aside from tree trunks, it's fairly clear of vegetation. A single area of rainforest can often be divided vertically into distinct microbiomes dominated by different species. Climbing, jumping, gliding, and flight are common adaptations to allow travel between trees without descending to the ground.

At higher elevations—above 500 m or so—rainforests tend to have shorter trees and thicker undergrowth. Where the elevation is high enough for clouds to be below canopy height, **cloud forests** form, with frequent fog and extremely moist conditions that support mosses and ferns.

Conversely, at low elevation broad swamps can form along riverbanks, with permanent or seasonal shallow water over the forest floor.

**Society**: Beneficial though rainforests are to wildlife, from a human perspective they're more hostile. Hunter‑gatherer tribes can thrive on the high productivity and moderate seasons, but to technological societies these are barriers. Thick plant growth and extremely wet conditions make travel difficult except by foot, and these regions still include some of the least accessible areas on Earth. There will typically be large rivers that make convenient avenues for travel, but these are often bordered by broad swamps and thick vegetation that make landings difficult. Diverse diseases, parasites, and predators are further hazards.

Of course, it's hard to say how much of this is inherent to rainforest climates, and how much is a result of societies from temperate climates trying to apply technology developed there to a new environment.

Frequent heavy rain is a challenge for construction and sanitation, but also leaches nutrients from the soil, making agriculture difficult, but not impossible. Inhabitants often use "**slash‑and‑burn**" farming, clearing an area of land to farm for several years, then leaving it to regrow while moving to a new location. While this is sustainable in principle, growing demand for food, in combination with logging, has led to mass deforestation.

Even when uncultivated, the high diversity of rainforest life makes them an excellent source of new edible fruits (including **bananas**, **sugarcane** and possibly **papayas**) and medicines. They are also the original source of **rubber** plants, and much is still grown there.

**[画像 13: 13_world_tropical_monsoon.jpeg]** — *Earth上のTropical Monsoon分布図*

#### Tropical Monsoon (*Am*)

Less than 2 mm/day but more than (100 – [total annual precipitation (mm)] / 25) mm total rain in the driest month of the year.

**Examples**: Southwest Indian coasts; Sierra Leone; Miami, Florida.

**Conditions**: This zone can be divided into two subtypes: Areas on the perimeters of rainforest zones that have similar wet and dry seasons that are somewhat more pronounced; And areas affected by monsoon wind patterns that have extremely wet summers—sometimes over 30 mm/day—and dry, sometimes rainless winters (winter months with no rain still satisfy the requirements if total annual rainfall is over 2,500 mm).

**[画像 14: 14_photo_Varandha_Ghat_India.jpeg]** — *Varandha Ghat, India. Cj.samsom, Wikimedia*

**Ecology**: Those areas bordering tropical rainforest are largely indistinguishable from them. Vertical microbiomes are less distinct, while more pronounced wet and dry seasons may lead to seasonal flooding. In areas caused by monsoon wind patterns, the severe dry season may favor woodier plants and vines, but in general the intense summer rains are sufficient to sustain thick forests.

**Society**: Once again, largely indistinguishable from rainforests. Farmers do have to take the seasonal rains into account and avoid planting crops too early before the wet season.

**[画像 15: 15_world_tropical_savanna.jpeg]** — *Earth上のTropical Savanna分布図*

#### Tropical Savanna (*Aw/As*)

Less than (100 – [total annual precipitation (mm)] / 25) mm total in the driest month.

**Examples**: Serengeti; Bangkok, Thailand; Havana, Cuba.

**Conditions**: As with the monsoon zone, there are two major subtypes: Regions on the perimeter of large rainforests, with moderate wet summers and dry winters, and regions affected by monsoon wind patterns that have very wet summers—sometimes over 10 mm/day—and dry winters. Moving poleward from the center of the tropical band, the dry season gets progressively longer and the wet season progressively shorter, especially on west coasts and interiors that eventually transition to steppes and deserts.

*As* regions are dry in summer and wet in winter due to rainshadow effects, but seasonal temperature variation is so low that this has little practical impact. There is some temperature variation, though: from around 20 ℃ in winter to 25 ℃ in summer.

**[画像 16: 16_photo_Serengeti_Tanzania.jpeg]** — *Serengeti, Tanzania. Harvey Barrison, Wkimedia*

**Ecology**: In spite of the name, this zone is not all open ground, and indeed it includes a large range of biomes; regions near rainforest or monsoon zones with short dry seasons will often have similarly lush forests. Areas with longer and more severe dry seasons will transition to **deciduous** forests, that drop their leaves in the dry season to conserve water—this lets more sunlight reach ground level, causing thicker undergrowth. These forests have less diversity than rainforests, and individual species have wider ranges. All life must adapt to long winter droughts. These forests are also more prone to large fires.

Finally, the driest areas transition to grassland, savanna (grassland with scattered trees) and shrubland. Large grazing herbivores and their associated predators and scavengers are common, many of them migrating long distances to avoid the dry seasons. Wildfires are common enough that many species have specifically adapted to survive or take advantage of them; grasses grow deep roots to allow them to regrow after burns, and fast‑moving predators hunt the animals fleeing the flames. Water can become a rare commodity in the dry season, with life concentrating around dwindling sources.

**Society**: Humans first developed in savannas, and were in many ways shaped by the need to effectively move, scavenge, and hunt there. Many of the last remaining hunter‑gatherers still live there, though this is largely because low rainfall makes these areas poor farmland.

Farming is still possible, and wetter areas are used for growing tropical plants like sugar and rubber, but the dry grassy areas lend themselves better to use as pasture land for cattle. **Maize** (a.k.a. **corn**) may have first developed and been cultivated in this climate zone, and some is still grown there today—though the major centers of maize cultivation have moved to the humid continental zone. **Sorghum**, **cassava**, **sweet potatoes**, and some types of **yams** also likely originated here, and remain staple crops in much of the zone today.

---

### B: Arid Climates

Annual average precipitation below ([annual average temperature (℃)] * 20 + [280 if >70% of precipitation are in 6 hottest months, 140 if 30‑70% of precipitation are in those months, 0 otherwise]) mm/year (definitions for the other climate groups implicitly exclude regions with precipitation this low).

**[画像 17: 17_world_arid_climates.jpeg]** — *Earth上のArid気候分布図*

#### Hot Desert (*Bwh*)

Annual precipitation less than half the threshold for arid climates, monthly average temperatures above 0 ℃ in all months (Some sources use annual average temperature above 18 ℃ for the hot/cold distinction instead).

**Examples**: Sahara; Arabian Desert; Cairo, Egypt; Phoenix, Arizona.

**Conditions**: The driest regions of the world; some areas can go years without any rain. When rains do happen, they're typically brief and intense. Average temperatures are lower than equatorial rainforests, but highly variable and so these areas have the hottest summer temperatures: Average summer temperature is often over 30 ℃ and peak temperature can exceed 50 ℃. But in winter average temperatures drop to around 15℉, and daily temperature ranges can exceed 20 ℃—meaning that nights can drop below 0 ℃, if infrequently.

Even cloud cover is generally uncommon, though areas near western coasts are notably cooler (closer to 20 ℃ in summer) and have frequent fog due to the influence of cool ocean currents—not that this increases precipitation much.

Sand and dunes only cover 1/5 of global deserts (hot and dry); much of the driest areas are covered in closely packed rocks resembling cobblestones or bare bedrock, and areas of soil and mud exist as well.

**[画像 18: 18_photo_Sahara_Libya.jpeg]** — *Sahara, Libya. Luca Galuzzi, Wikimedia*

**Ecology**: Life is rare, but not absent. Relatively wet areas can support shrubs, cacti, and even trees, though all tend to be woody with small leaves. Much of the animal life burrows underground to avoid midday heat, and all life has adapted to minimize water loss. Rare heavy rains can cause brief growths of grass and flowers, which release seeds that will remain dormant until the next opportunity. In regions with fog, plants specialize to extract moisture from dew rather than rain.

But in the very driest regions, life is largely restricted to passing migratory species.

**Society**: Deserts are, for the most part, essentially uninhabitable. Barring an alternative source of water besides rainfall, agriculture is impossible, and much of the desert is covered in shifting sand or bare rock that couldn't support crops even with water.

Notable exceptions are regions with large rivers flowing in from wetter areas, such as the Nile, Indus, or Tigris and Euphrates. Despite the lack of rain, seasonal flooding of these rivers provides sufficient moisture and nutrients for growing crops, and uninterrupted sun by day lends itself to very productive agriculture. Thanks to this many of our earliest civilizations emerged in desert climates (though some may have been slightly wetter at the time) and so desert zones ironically included some of the most agriculturally productive areas of the ancient world.

Elsewhere, **oases** fed by underground aquifers also provide small islands of habitability and goop crop productivity. Hilly and mountainous regions can also have sheltered river valleys, though in those areas flash flooding during heavy rains is a concern.

Away from these water sources, permanent settlements are rare. Nevertheless, various societies have at one time or another found it necessary to cross deserts for migration, trading, warfare, or resource extraction. Caravans trace routes between oases and wells, and control of these routes has often been a major strategic and economic concern for neighboring societies. Sometimes the traders themselves can become distinct nomadic societies.

In spite of these connections, large deserts can be significant barriers to the spread of societies, culture, and technology.

**[画像 19: 19_world_hot_desert.jpeg]** — *Earth上のHot Desert分布図*

#### Cold desert (*Bwk*)

Annual precipitation less than half the threshold for arid climates, average temperature below 0 ℃ part of the year.

**Examples**: Gobi Desert, Patagonia, Great Basin Desert.

**Conditions**: These regions generally still have hot (15‑20 ℃) summers, but freezing winters. Snow is rare but possible. Daily temperature ranges are large just as in hot deserts, and clouds uncommon; Given that they're formed mostly by rainshadow effects, few deserts of this type border the sea.

**[画像 20: 20_photo_Gobi_Mongolia.jpeg]** — *Gobi Desert, Mongolia. Doron, Wikimedia*

**Ecology**: Similar in most ways to hot deserts. Peripheral areas can support grasses and shrubs, and milder summer temperatures benefit plant life. But life here has to contend not only with hot days, but cold nights and winter frosts as well.

**Society**: Because these regions are typically far inland, they rarely have large rivers running through them and so are less likely to feature the productive river floodplains that hot deserts do. Like hot deserts, trade and movement across these areas is difficult but often necessary. Just as for wildlife, milder summers are easier to contend with but cold nights are more hazardous.

**[画像 21: 21_world_cold_desert.jpeg]** — *Earth上のCold Desert分布図*

#### Hot steppe (*Bsh*)

More than half the precipitation threshold, above 0 ℃ in all months (again, some sources use 18 ℃ annual temperature as the hot/cold boundary).

**Examples**: Sahel; Lahore, Pakistan; Monterrey, Mexico.

**Conditions**: Somewhat wetter than hot deserts and bounding them on all sides. Summer temperatures and daily temperature variation are generally lower than for deserts, but not by much. Steppes on the equatorward side of the desert belts have relatively wet summers and dry winters, while those on the poleward side have dry summers and wet winters like the Mediterranean zone. There are also areas affected by monsoon winds that can have brief, intense wet summers with rains over 5 mm/day, and rainless winters (these aren't well represented by this tutorial, but are small in extent).

**[画像 22: 22_photo_Sahel_Mali.jpeg]** — *Sahel, Mali. NOAA*

**Ecology**: These are, like savanna, transitional zones; the wettest regions can have scattered deciduous forests, while the driest are nearly as barren as deserts. The forests are only common in areas affected by monsoon patterns, and are dominated by woody plants; in most of this zone, grassland and shrubland dominate. Herding animals and associated species can be common in the wet season. As in tropical savanna, wildfires are common.

**Society**: Despite the low precipitation, agriculture is possible and even quite productive on the banks of large rivers—though these aren't as vital as for deserts. Some varieties of **millet** may first have been cultivated here. Pastureland can also be productive here. Unlike most desert areas, agricultural productivity is high enough and access to water easy enough that widespread settlement is possible even far from major water sources.

**[画像 23: 23_world_hot_steppe.jpeg]** — *Earth上のHot Steppe分布図*

#### Cold steppe (*Bsk*)

More than half the precipitation threshold, below 0 ℃ part of the year.

**Examples**: Central Turkey; Central Spain; Denver, Colorado.

**Conditions**: These regions have more consistent moderate precipitation throughout the year than hot steppes, and subfreezing winter temperatures, so they do usually have some snow in winter. Outside of the Hadley cell, precipitation more often comes in the form of distinct storms than daily rain. Some of these regions appear in highlands as a transition from wetter lowland climates to dry mountain plateaus.

**[画像 24: 24_photo_Badlands_SouthDakota.jpeg]** — *Badlands National Park, South Dakota. Wing-Chi Poon, Wikimedia*

**Ecology**: Again, these are mostly grasslands and shrublands, and include American prairies. Mild summers makes evaporation slower than in hot steppes and these areas are generally more hospitable to life without adaptations for hot and dry conditions. Large herding animals and small burrowing animals are common.

**Society**: This is the arid zone most hospitable to widespread settlement. Productive agriculture is possible even far from major rivers, and **potatoes** may have originated in highland areas of this zone. Dryer areas are still more often pastureland. Population density is generally low, but large cities are more common than in deserts or hot steppes.

---

### C: Temperate Climates

Coldest month between 0 ℃ and 18 ℃, hottest month above 10 ℃ (some sources use ‑3 ℃ in the coldest month as the temperate/continental distinction instead).

**[画像 25: 25_world_cold_steppe.jpeg]** — *Earth上のCold Steppe分布図 (Mediterranean直前)*

#### Mediterranean (*Csa/Csb/Csc*)

3 times more rain in the wettest month of winter than the driest month of summer, driest month in summer below 1 mm/day.

**Examples**: Coastal Mediterranean (big surprise); US west coast; Cape Town, South Africa; Santiago, Chile.

**Conditions**: In many ways a transition between arid steppes and more humid temperate climates, and somewhat unusual in having significantly wetter winters than summers due to the alternating influence of the horse latitudes and the polar front. More equatorward regions (*Csa*) resemble steppes in many ways: hot summers (25 ℃) with high temperature variability (10 ℃), and low rains even in the wet season (<3 mm/day). Further poleward or at higher altitude (*Csb/Csc*), temperatures are more moderate and winter rains can exceed 5 mm/day, with occasional snowfall. Where these regions lie on the coasts of major oceans, cold currents cause frequent morning fog.

Rarely does this climate zone reach far from the coast; it's only because of the particular position and geography of the Mediterranean sea on Earth (And the southwest coast of Hutton on Teacup Ae) that it covers so much area. A notable exception is in highlands in the tropical or desert belts, where seasonal rainshadows can create the requisite dry summer/wet winter cycle.

**[画像 26: 26_photo_Penon_Alhucemas_Spain.jpeg]** — *Peñón de Alhucemas, Spain. Kokopelado, Wikimedia*

**Ecology**: Though small in extent, the life in these regions is very distinct. Hot, dry summers favors life adapted for steppes, but high average precipitation and mild temperatures favors life from other temperate zones. Much of the zone has a "mosaic" landscape, with small areas of forest, savanna, shrubland, and grassland mixed together. Small variations in access to water in summer can be very impactful; wooded streambanks often exist in close proximity to grassy hilltops. Evergreen, deciduous, and **coniferous** trees are all mixed as well, though with some division by latitude and altitude. Equatorward, low‑altitude mosaic landscape gives way to poleward, high‑altitude pine forests.

Animal life is similarly a mix of groups also seen in tropical and temperature climates. This zone tends to lack the large migratory herding animals more common in steppe zones, but do retain the small burrowing animals. Cold‑blooded animals that can't withstand cooler poleward winters are common here.

Despite the broad milieu, most life has some adaptation to the dry summer conditions, as well as the frequent wildfires. Small shifts in average rainfall can dramatically increase the proclivity to fierce fires in forest areas.

**Society**: Though civilization didn't begin here, many early large societies did develop in the Mediterranean zone—though only in the areas around the eponymous sea. It's a bit early in this series to speculate on exactly why, but perhaps a mix of very mild winters and wet enough conditions for easy agriculture can be credited. Today this zone is widely regarded as among the most comfortable regions, and tourism is popular.

**Wheat**, **barley**, and **rye** all likely originated in this zone, and possibly **oat** as well; the short wet seasons and long, hot dry seasons seem to lend themselves to the development of plants that grow quickly and produce durable, easily stored seeds. **Olives** and **grapes** are also widely grown, and **wine** and **beer** were likely first developed here. These are not the most productive regions today but are known for the wide diversity of foodstuffs they produce.

**[画像 27: 27_world_mediterranean.jpeg]** — *Earth上のMediterranean分布図*

#### Humid Subtropical (*Cfa/Cwa*)

Hottest month above 22 ℃, above 1 mm/day average precipitation in all months of summer.

**Examples**: Southwest China; Southwest USA; Milan, Italy; Johannesburg, South Africa.

**Conditions**: As the name implies, these are wet regions, in some cases comparable to rainforests in summer (>6 mm/day) but also including more moderate regions (3 mm/day). The major distinction is between the main (*Cfa*) regions with consistent rains throughout the year, and **monsoon‑infuenced** (*Cwa*) regions with 10 times more rain in their wettest month than their driest month. The former dominates in the main areas at mid latitude on eastern coasts, while the latter appears in highlands and areas with monsoon wind patterns.

Summers are, by definition, quite hot, and rarely do winters drop below freezing. Thunderstorms are common, and these areas are often the most prone to hurricanes and tornadoes.

**[画像 28: 28_photo_Bayou_Corne_Louisiana.jpeg]** — *Bayou Corne, Louisiana. jc.winkler, Wikimedia*

**Ecology**: Much of this zone is dominated by dense forests of evergreen plants, especially close to the border with the tropical band. Density of vegetation can be comparable to tropical rainforest, with fierce competition for sunlight and canopies blocking most sunlight, though vertical microbiomes aren't as distinct. These regions are so moist that many plants have to adapt to shed water rather than retain it. On flat ground, swamps are common on coastlines and along rivers.

More poleward, less packed forests predominate and there are more areas of open ground. In the driest areas forest can give way to grassland, though these are less extensive than for the Mediterranean zone.

**Society**: To some extent the more equatorward areas present much of the same hazards as tropical rainforests: dense plant growth, heavy rains, risk of disease, etc. But temperatures are milder and soil quality is notably better; some of the earliest agriculture began here, and these remain among the most productive farming regions in the world. **Rice** and **soybeans** originated in this zone and are still mostly grown here today.

**[画像 29: 29_world_humid_subtropical.jpeg]** — *Earth上のHumid Subtropical分布図*

#### Oceanic (*Cfb/Cfc/Cwb/Cwc*)

Hottest month below 22 ℃, above 1 mm/day precipitation in summer.

**Examples**: British Isles; North and central France; New Zealand; Vancouver, British Columbia.

**Conditions**: This is probably what leaps to mind when most people imagine a "temperate climate", with mild temperatures, consistent rains, and strong but not extreme seasons. The major subtypes, from most equatorward to most poleward are **subtropical highland** (*Cwb*), which appears in highland regions in the tropics and so has consistent average temperatures across the year (15‑20 ℃) but high daily temperature ranges (15 ℃), and very distinct wet summers (5 mm/day) and dry winters (<1 mm/day); **marine** (*Cfb*), the dominant form at mid latitudes, with mild summers (15‑20 ℃) and winters (5‑10 ℃), consistent rains throughout the year (2‑5 mm/day), and occasional but not persistent frost and snow; and **subpolar** (*Cfc/Cwc*), in small areas in mid‑latitude highlands and high‑latitude coasts, which are broadly similar to marine but 5‑10 ℃ cooler throughout the year, with winter nights regularly below freezing.

**[画像 30: 30_photo_Moor_England.jpeg]** — *Moor, England. dennisredfield, Wikimedia*

**Ecology**: This zone is predominantly forest, with a mix of evergreen, deciduous, and coniferous trees. Trees are lower and the canopy less packed, so there's more undergrowth here than in more equatorward forests. Some of the wettest areas on the coasts feature **temperate rainforests**, with consistent intense rains and high canopies.

Large herbivores and predators are fairly rare. Average temperatures are low enough that cold‑blooded species are also rarer than in other temperate zones, with small‑ and medium‑sized warm‑blooded forest animals dominating.

This zone also includes many **montane** forests and grasslands at lower latitudes, which have an unusual combination of low temperatures and intense sunlight. At lower altitudes these regions include some of the cloud forests mentioned earlier, while at higher latitudes they give way to shrubs with waxy surfaces to retain moisture. High winds and little available soil become a major obstacle, and so plants tend to be low and slow‑growing.

**Society**: Agriculture and dense cities were slow to arrive in these areas, but in more recent times this region has hosted major centers of industry and urbanization. Neither summers nor winter are harsh, agriculture is reliable, and there are no major terrain hazards; dense forests and swamps can create some geographic barriers but not to the same extent as rainforests in warmer climates. Harsh winter blizzards and frosts are not the norm, but frequent enough to be a hazard to life here without proper shelter.

---

### D: Continental Climates

Coldest month below 0 ℃, hottest month above 10 ℃.

**[画像 31: 31_world_oceanic.jpeg]** — *Earth上のOceanic分布図 (Continental直前)*

#### Humid Continental (*Dsa/Dsb/Dwa/Dwb/Dfa/Dfb*)

At least 4 months above 10 ℃.

**Examples**: Poland; Northeast USA; Seoul, South Korea; Moscow, Russia.

**Conditions**: In many ways this climate resembles the temperate zones, but with 3‑5 months with subfreezing temperatures. The subtypes are hotter (*Dsa/Dwa/Dfa*) and cooler (*Dsb/Dwb/Dfb*) areas with precipitation patterns resembling those of mediterranean (*Dsa/Dsb*), monsoon‑influenced humid subtropical (*Dwa/Dwb*), and marine oceanic (*Dfa/Dfb*) patterns, though precipitation patterns are overall less impactful here to life and society.

Heavy winter snows are common, and oscillations in the position of the polar front in winter tends to cause cycles of milder and colder periods.

**[画像 32: 32_photo_Table_Mountains_Poland.jpeg]** — *Table Mountains, Poland. Poconaco, Wikimedia*

**Ecology**: This is a very broad region, encompassing dense forests, broad grasslands and prairies, and highland shrubs. The unifying element is the strong seasonality; long, hot summers provide plenty of time for growth, but all species need some adaptations for the subfreezing winters. Trees are predominantly deciduous—shedding vulnerable leaves in winter—or coniferous—with smaller, tougher leaves such that they can be retained year‑round. Many animals either migrate, leaving for warmer climates in winter, or **hibernate**, minimizing energy consumption.

Cold‑blooded animals are not absent but uncommon and small, and many animals have some insulating fur or feathers to protect from the cold—sometimes with alternating long and short coats that are grown and shed with the seasons. In some of the more open areas, herds of migrating herbivores and their associated large predators and scavengers are common, somewhat akin to those in tropical savanna despite the vastly different climate conditions.

**Society**: Though agriculture was slow to come to this zone (excepting perhaps some highland areas in the near east) it now includes some of the most agriculturally productive areas in the world. Some varieties of East Asian **millet** likely originated here. Much of the world's lumber production also occurs in this zone.

Strong seasonality is the hallmark of this zone. Warm summers bring good growing seasons, but the harsh winters are a consistent challenge. Spring and fall also tend to be accompanied with "mud seasons", when heavy rains or snow melt combined with little sunlight and cool temperatures causes large amounts of standing water and mud to cover much of the ground. Travel in these times is difficult in areas without paved roads.

**[画像 33: 33_world_humid_continental.jpeg]** — *Earth上のHumid Continental分布図*

#### Subarctic (*Dsc/Dsd/Dwc/Dwd/Dfc/Dfd*)

No more than 3 months above 10 ℃.

**Examples**: Central Finland; Siberia; Anchorage, Alaska.

**Conditions**: Shares essentially all of the same subtypes as humid subcontinental, but they're even less impactful here. Summers are usually around 15 ℃, but winters can plunge below ‑30 ℃, and much of this zone spends more time below freezing than above it. For the most part precipitation is lower than in temperate zones, but not as low as steppes.

**[画像 34: 34_photo_Alaska_Range_Alaska.jpeg]** — *Alaska Range, Alaska. NOAA*

**Ecology**: This zone is dominated by **taiga**, A.K.A. **boreal forest**, vast stretches of forest dominated by a relatively small number of mostly coniferous trees; biodiversity is much lower here than in warmer forests. Summers may be short, but the days are long, and much of the life here is adapted to take advantage of the sun even in cold conditions. Though rainfall is low, slow evaporation and melting snow make for moist conditions, so moss and lichen are common.

There is little biological activity in winter; plant life falls dormant, and animal life either migrates away or hibernates.

**Society**: Agriculture here is possible, but fairly unproductive. Hunting, trapping, and fishing are more reliable sources of food in many areas, and lumber and fur production are major industries. Population density is generally fairly low and infrastructure undeveloped. These are marginal areas, with most activity concentrated on survival rather than, say, empire‑building.

---

### E: Polar and Alpine Climates

All months below 10 ℃.

**[画像 35: 35_world_subarctic.jpeg]** — *Earth上のSubarctic分布図 (Polar/Alpine直前)*

#### Tundra (*ET*)

Hottest month above 0 ℃.

**Examples**: Coastal Greenland; Central Himalayas; Central Alps.

**Conditions**: Brief summers and long, cold winters often plunging to below ‑50 ℃. Precipitation is generally low, even lower than steppes and deserts in warmer areas, though low temperature means that evaporation is slow so this has little bearing on surface conditions. Snow covers the ground through much of the year, but does melt in summer.

Most of these areas are around the periphery of the ice caps, but they also occur in high, isolated mountain plateaus, even close to the equator, and these areas have milder winters.

**[画像 36: 36_photo_Sydkap_Greenland.jpeg]** — *Sydkap, Greenland. Hannes Grobe, Wikimedia*

**Ecology**: Some taiga reaches into this zone, but for the most part it's a barren environment limited to grasses, shrubs, mosses, and lichen. This is due not only to low surface temperature, but permanently frozen soil less than a meter below the surface. Some large grazers and predators can pass through in summer. Almost all life is warm‑blooded.

The seas are far more productive, and so some of the coastal areas are populated by amphibious or flying predators, and some predators and scavengers preying on them.

**Society**: As with animal life, most human life in these areas are dependent on the sea, so settlement is largely limited to coastal fishing villages. In inland areas, some settlements can survive on hunting or raising livestock that can feed on the limited grasses and shrubs.

**[画像 37: 37_world_tundra_polar.jpeg]** — *Earth上のTundra/Polar分布図*

#### Ice Cap (*EF*)

All months below 0 ℃.

**Examples**: Antarctica; Central Greenland; Mount Everest.

**Conditions**: As you'd imagine, this area is permanently covered in ice; often large, thick glaciers. Average temperatures in the interior are often below ‑30 ℃, and precipitation is comparable to deserts. Some isolated valleys can remain ice‑free due to many years with no snow.

**[画像 38: 38_photo_Lake_Fryxell_Antarctica.jpeg]** — *Lake Fryxell, Antarctica. National Science Foundation*

**Ecology**: Little life to speak of. Plant growth is impossible, so for the most part the only source of food is the sea. The inland areas are populated solely by passing amphibious or flying predators, and some marginal microbes.

**Society**: Again, not much. There are no permanent settlements here save for research stations, which have to be supplied from elsewhere. Harsh winter storms and glacier crevices are extreme hazards.

---

## Biomes and Biogeographic Regions

As I mentioned near the start—and as should have become clear in the last section—the climate zones don't perfectly predict the biomes of a world. Development of distinct biomes depends on factors like evaporation, soil quality, and water supplies other than precipitation. There are some alternative climate zone systems, like the Holdridge system, that better account for these factors, but require more precise data or calculations that are impractical to do by hand.

**[画像 39: 39_earth_biomes.jpeg]** — *One breakdown of Earth's biomes. Ville Kroistinen, Wikimedia.* 凡例: ice sheet and polar desert / tundra / taiga / temperate broadleaf forest / temperate steppe and savanna / subtropical evergreen forest / Mediterranean vegetation / monsoon forests and mosaic / arid desert / xeric shrubland / dry steppe and thorn forest / semiarid desert / grass savanna / tree savanna / dry forest and woodland savanna / tropical rainforest / alpine tundra / montane forests and grasslands.

Still, the differences aren't too great, and having a little authorial freedom to determine the precise biome types isn't exactly the worst burden. I think I'm comfortable settling for the Köppen system as a template for Teacup Ae's climate.

But one other factor we can determine now is the breakdown of biogeographic regions. These are, in a sense, the ecological equivalent of continents: large areas divided by barriers like deserts, mountains, or seas, or by the sharp transition between temperature and tropical climates, and each represents an area within which successful types of land animals or plants can circulate on short evolutionary timescales; put another way, different regions with the same climate may have similarly structured ecosystems, but will have different groups occupying the same niches.

*Earth's major biogeographic regions (save for Oceania and Antarctica). carol, Wikimedia* (※ ミニマップは画像として独立検出されず)

To mark them out, group together clusters of continents and islands, and divide them roughly along the desert belt or the tropical‑temperate boundary, save for in cases where the tropical or temperate areas of that cluster are too small to have much diversity of their own. Regarding islands, try to take geological history in mind; areas recently split from the mainland are likely to still have similar life, and may still have shallow waters separating them or may become connected again in times of low sea level.

That in mind, here's how I've broken down Ae, along with some names for the biogeographic regions for later reference. When we think about wildlife in a later post, this will help give us an idea for how to distribute them.

**[画像 40: 40_teacup_Ae_biogeographic_regions.jpeg]** — *Teacup Aeの生物地理区分け. Steno-Holmes / Hutton / Archipelago / Lyell / Tropico-Wegener / Tempero-Wegener / Agassiz の7区域*

---

## In Summary

- Climate zones can be classified based on temperature and precipitation patterns across the seasons.
- The atmospheric convection cells and associated prevailing winds cause major climate bands:
    - Rainforest near the equator.
    - Deserts near the horse latitudes, except on eastern coasts.
    - Temperate at mid latitudes.
    - Tundra and ice caps near the poles.
- Large mountain ranges can cause high rains on their windward sides and dry rainshadows on their leeward sides.
- Ocean currents bring warm waters to western coasts at high latitudes and cool waters to eastern coasts at high latitudes and western coasts at low latitudes.
- High mountains have climates more typical of higher latitudes (by about 8° latitude per km elevation).
- Oceans form ice sheets when they drop below ‑2 ℃
- The ITCZ and other convection cell boundaries move with the seasons, causing monsoon rains and similar patterns.
- Prevailing winds are caused by a combination of the atmospheric convection cells and local pressure zones caused by surface temperature.
- Winds carry moisture inland from the coasts, causing precipitation thaat generally decreases further inland, save for where it is increased by converging winds and orographic rains.
- Köppen climate zones are defined by temperature and precipitation patterns across the seasons: (notes: Temperature values are averages for the months of peak summer and peak winter; precipitation averages are rough guidelines; for all zones except Mediterranean, summer is presumed to be the wettest season).

### Climate Zone Summary Table

凡例: 各セルは閾値・典型値。空欄は条件なし／不問。

| Climate Zone | Temp Summer Min (℃) | Temp Summer Max (℃) | Temp Winter Min (℃) | Temp Winter Max (℃) | Precip Summer Min | Precip Summer Max | Precip Winter Min | Precip Winter Max |
|---|---|---|---|---|---|---|---|---|
| **Group A** | | | 18 | | Wet | | | |
| Rainforest | | | 18 | | Very Wet | | Wet | |
| Monsoon | | | 18 | | Wet | | | Wet |
| Savannah | | | 18 | | Wet | | | Dry |
| **Group B** | | | | | | Dry | | Dry |
| Hot Desert | | | 0 | | | Dry | | Dry |
| Cold Desert | | | | 0 | | Dry | | Dry |
| Hot Steppe | | | 0 | | | Dry (border) | | Dry |
| Cold Steppe | | | | 0 | | Dry (border) | | Dry |
| **Group C** | 10 | | 0 | 18 | | | | |
| Med. | 10 | | 0 | 18 | | Dry | Wet | |
| Subtropical | 22 | | 0 | 18 | Wet | | | |
| Oceanic | 10 | 22 | 0 | 18 | Wet | | | |
| **Group D** | 10 | | | 0 | Wet | | | |
| Humid Continental | 10 (>3 months) | | | 0 | Wet | | | |
| Subarctic | 10 (1‑3 months) | | | 0 | Wet | | | |
| **Group E** | | 10 | | | | | | |
| Tundra | 0 | 10 | | | | | | |

(※スクリーンショット末尾でTundra行がカットオフ。Ice Cap行は元画像に含まれていない可能性あり)

---

## Notes (別ページ — WORLDBUILDING PASTA)

In case anyone wants them, [here's a group of maps](#) of each of the individual Köppen climate zones on Earth (along with some regional maps). Note that some depict current zones, and some show near‑future predictions of how zones will move as global climate warms.

Should someone want to follow me down the rabbit hole of trying to find a reasonably usable GCM, here are my findings:

- **ROCKE3D** is probably the most promising, with good documentation and intentional design for flexibility and use with exoplanets, but 1, I'm not confident it will run well on home computers, and 2, there's little explanation of how to import novel topography into the program other than to note that it's hard. I'll try running some tests with this one in the near future.
- **EdGCM** is by far the easiest to use, but the least customizable, and again there's no clear way to add topography—but it would probably be similar to the process for ROCKE3D, given their "shared ancestry".
- **FOAM** has a pretty clear process for importing topography, but the program itself doesn't appear to be publicly available.
- **PlaSim** has a basic and awkward topography editor, and isn't *too* hard to get working (if you're willing to install linux), but for the life of me I can't figure out how to interpret the output.
- **MitGCM** is one I've seen a few worldbuilding sites recommend, but I've never seen anyone claim to have actually used it.

I very much encourage anyone who gets a GCM working for fictional topography (or already has in the past) to contact me (comment here or email worldbuildingpasta@gmail.com) and tell me about the process.
