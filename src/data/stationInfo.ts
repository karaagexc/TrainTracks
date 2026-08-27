export interface StationInfoData {
    images: string[];
    description: string;
    history: string;
    nameOrigin: string;
}

export const STATION_INFO: Record<string, StationInfoData> = {
    // ═══════════════════════════════════════════════════════
    //  LRT-1 (Green Line)
    // ═══════════════════════════════════════════════════════

    'L1-20': {
        images: [
            '/station-images/lrt1-fernando-poe-jr.webp',
        ],
        description: 'Fernando Poe Jr. station, previously and more commonly known as Roosevelt station, is the northernmost terminal of LRT Line 1. It serves as a major transit hub linking Congressional Avenue and FPJ Avenue commuters to the rest of the metro.',
        history: 'Opened on October 22, 2010, as part of the LRT-1 North Extension Project. From 1985 to 2010, Monumento served as the northern terminus until this extension was built. It was officially renamed on August 20, 2023, following the renaming of the adjacent avenue in 2021.',
        nameOrigin: 'Originally named Roosevelt after Roosevelt Avenue, which itself honors U.S. President Theodore Roosevelt. It was renamed together with the avenue in honor of Filipino cinema icon Fernando Poe Jr. (FPJ), who spent much of his life working in the area.',
    },
    'L1-19': {
        images: [
            '/station-images/lrt1-balintawak.webp',
        ],
        description: 'Balintawak station is an elevated station on LRT Line 1 that primarily serves commuters from the Balintawak area at the border of Quezon City and Caloocan, providing crucial access to the North Luzon Expressway (NLEX).',
        history: 'Opened on March 22, 2010, leading up to the final extension to Roosevelt later that year. It was built as part of the LRT-1 North Extension Project designed to link the endpoint in Caloocan (Monumento) to the Quezon City transit hubs.',
        nameOrigin: 'Named after the historic district of Balintawak along the boundary of Quezon City and Caloocan. Balintawak is most famous as the site of the "Cry of Balintawak" in August 1896, marking the outbreak of the Philippine Revolution.',
    },
    'L1-18': {
        images: [
            '/station-images/lrt1-monumento.webp',
        ],
        description: 'Monumento station is a heavy-traffic station on LRT Line 1, located in Caloocan. It serves as a major transportation hub for commuters from northern Metro Manila (Navotas, Malabon, Valenzuela).',
        history: 'Opened on May 12, 1985, as part of the second operational phase of the original LRT-1. It proudly served as the northern terminal ("North Terminal") for exactly 25 years until the Balintawak extension opened in 2010.',
        nameOrigin: 'Named after the adjacent Monumento Circle (Bonifacio Monument). The 1933 monument, designed by National Artist Guillermo Tolentino, honors Philippine revolutionary hero Andrés Bonifacio.',
    },
    'L1-17': {
        images: [
            '/station-images/lrt1-5th-avenue.webp',
        ],
        description: '5th Avenue station is an elevated station on LRT Line 1 in the Grace Park area of Caloocan City. It acts as a vital commuter link for the highly urbanized Grace Park community and intersecting C-3 road traffic.',
        history: 'Opened on May 12, 1985, as part of the northern half of the original Taft-Rizal LRT-1 stretch. After facing delays in construction during the late Marcos era, the section from Carriedo to Monumento was finally completed.',
        nameOrigin: 'Named after its lateral cross-street, 5th Avenue (historically designated as Circumferential Road 3 or C-3), which is a key east-west road through the grid-like Grace Park district of Caloocan.',
    },
    'L1-16': {
        images: [
            '/station-images/lrt1-r-papa.webp',
        ],
        description: 'R. Papa station is the northernmost LRT Line 1 station physically within the City of Manila limits. It provides transit access to Barrio Obrero in Tondo.',
        history: 'Opened on May 12, 1985, with the second phase of the original line. It has been a steady transit point for residents of Tondo looking to travel to the central business districts of Manila and Pasay.',
        nameOrigin: 'Named after the nearby Ricardo Papa Street. Ricardo Papa was a notable Manila Police District chief and later served as the Commanding General of the Philippine Army.',
    },
    'L1-15': {
        images: [
            '/station-images/lrt1-abad-santos.webp',
        ],
        description: 'Abad Santos station is an elevated station serving the Tondo and Santa Cruz districts of Manila. It sits immediately before the tracks shift from Rizal Avenue to Rizal Avenue Extension.',
        history: 'Opened on May 12, 1985, when the northern half of LRT-1 was officially completed. The surrounding area remains one of the oldest low-rise commercial hubs of the capital.',
        nameOrigin: 'Named after the intersecting Abad Santos Avenue. The avenue honors José Abad Santos, the 5th Chief Justice of the Philippine Supreme Court who was executed by the Japanese in 1942 for refusing to collaborate.',
    },
    'L1-14': {
        images: [
            '/station-images/lrt1-blumentritt.webp',
        ],
        description: 'Blumentritt station is a crucial interchange on LRT Line 1, located near the Blumentritt Market in Manila. It provides a walking transfer to the PNR Blumentritt railway station.',
        history: 'Opened on May 12, 1985. The area is defined by its incredibly dense commercial street market and has been a staple interchange for commuters transferring between the LRT and the old PNR commuter trains.',
        nameOrigin: 'Named after Blumentritt Road, which intersects Rizal Avenue. It honors Ferdinand Blumentritt, an Austrian scholar and schoolmaster who was a confidant and close friend of national hero José Rizal.',
    },
    'L1-13': {
        images: [
            '/station-images/lrt1-tayuman.webp',
        ],
        description: 'Tayuman station serves the Santa Cruz district of Manila, specifically connecting the residential and commercial areas along Tayuman Street to the greater transit network.',
        history: 'Opened on May 12, 1985. Located in a deeply historic medical and religious corridor of old Manila, it offers transit to several hospitals like San Lazaro Hospital, and the Archdiocesan Shrine of Espiritu Santo.',
        nameOrigin: 'Named after Tayuman Street. The word "tayuman" derives from the Tagalog root "tayom," signifying the indigo plant (Indigofera tinctoria) that was historically grown and processed in this area.',
    },
    'L1-12': {
        images: [
            '/station-images/lrt1-bambang.webp',
        ],
        description: 'Bambang station is an elevated LRT Line 1 station in Santa Cruz, Manila. The area immediately below and around the station is widely known as Manila\'s primary medical and laboratory supply hub.',
        history: 'Opened on May 12, 1985. Since its opening, the neighborhood around Bambang has cemented its reputation as the go-to wholesale market for affordable healthcare equipment in the capital.',
        nameOrigin: 'Named after Bambang Street. The Tagalog term "bambang" translates to an "irrigation ditch" or "canal," reflecting the geography of pre-colonial and Spanish-era Manila which was once crisscrossed with waterways.',
    },
    'L1-11': {
        images: [
            '/station-images/lrt1-doroteo-jose.webp',
        ],
        description: 'Doroteo Jose station is one of the most critical interchange hubs in the entire network. Located in Santa Cruz, it connects LRT-1 to LRT-2\'s Recto station via a covered elevated walkway.',
        history: 'Opened on May 12, 1985. Its architectural importance soared in 2004 when the LRT-2 connection to Recto station was realized, creating an inescapable "choke point" for passengers moving between the north-south and east-west axes.',
        nameOrigin: 'Named after Doroteo Jose Street. Doroteo José was a brave Filipino who was arrested by Spanish authorities in 1898 for leading a movement demanding the expulsion of the corrupt Spanish Archbishop of Manila.',
    },
    'L1-10': {
        images: [
            '/station-images/lrt1-carriedo.webp',
        ],
        description: 'Carriedo station is situated right at the border of Santa Cruz and Quiapo in Manila. It is the first station immediately north of the Pasig River and sits in the chaotic, historic core of the city\'s commerce.',
        history: 'Opened on May 12, 1985. The station was designed with a unique layout where the concourse is positioned completely below the tracks rather than on a mezzanine due to the tight urban spacing of Rizal Avenue.',
        nameOrigin: 'Named after Carriedo Street, connecting Plaza Lacson to Quiapo. It honors Francisco Carriedo y Peredo, a 18th-century Spanish philanthropist who endowed the funds to establish Manila\'s original pipe waterworks system.',
    },
    'L1-09': {
        images: [
            '/station-images/lrt1-central-terminal.webp',
        ],
        description: 'Central Terminal (historically Arroceros Station) serves as the primary gateway to Manila\'s civic spaces including Manila City Hall, Intramuros, and the National Museum complex.',
        history: 'Opened on December 1, 1984, as the very first northern terminus of the operational LRT-1 (Baclaran to Central) before the rest of the line finished in 1985.',
        nameOrigin: 'Initially named "Central" reflecting its intended status as the central hub of Manila. Colloquially called Arroceros due to its location on Arroceros Street (now Antonio Villegas St) and the nearby Arroceros Forest Park.',
    },
    'L1-08': {
        images: [
            '/station-images/lrt1-united-nations.webp',
        ],
        description: 'United Nations station serves the Ermita district of Manila, providing immediate walking access to Rizal Park (Luneta), the World Health Organization regional office, and the NBI headquarters.',
        history: 'Opened on December 1, 1984, in the very first operational run of the LRT system. At 13 stations from either endpoint, it geographically serves as the exact midpoint of the original LRT-1 alignment.',
        nameOrigin: 'Named after United Nations Avenue, a major avenue originally known as Calle Isaac Peral, renamed in 1945 to commemorate the founding of the United Nations, a charter the Philippines originally signed.',
    },
    'L1-07': {
        images: [
            '/station-images/lrt1-pedro-gil.webp',
        ],
        description: 'Pedro Gil station serves Ermita and Malate. It is a vital station for medical students and professionals due to its proximity to the Philippine General Hospital (PGH) and UP Manila.',
        history: 'Opened on December 1, 1984, as part of the Phase 1 opening of the inaugural line. Formerly known during planning simply as Herran station, it remains one of the most consistently busy midpoint stations.',
        nameOrigin: 'Named after Pedro Gil Street (formerly Calle Herran), honoring Pedro Gil, a physician, journalist, and legislator who served in the Philippine House of Representatives and as an ambassador.',
    },
    'L1-06': {
        images: [
            '/station-images/lrt1-quirino.webp',
        ],
        description: 'Quirino station is located at the intersection of Taft Avenue, San Andres Street, and Quirino Avenue in Malate, serving an area dense with residential properties, hotels, and universities.',
        history: 'Opened on December 1, 1984, as part of the initial "Taft Line" activation. Historically called President Quirino station.',
        nameOrigin: 'Named after President Elpidio Quirino Avenue. Quirino was the 6th President of the Philippines (1948–1953) who led the post-WWII reconstruction of the country.',
    },
    'L1-05': {
        images: [
            '/station-images/lrt1-vito-cruz.webp',
        ],
        description: 'Vito Cruz station is heavily utilized by university students as it caters to the direct vicinity of De La Salle University, College of St. Benilde, and St. Scholastica\'s College.',
        history: 'Opened on December 1, 1984, along the inaugurational southern half of LRT-1. It is the geographic boundary station, being the southernmost station located strictly within the City of Manila.',
        nameOrigin: 'Retains the historic name of the nearby street: Vito Cruz Street (now Pablo Ocampo Sr. Street). Hermogenes Vito Cruz was an alcalde mayor of Pineda (now Pasay) in the late 19th century.',
    },
    'L1-04': {
        images: [
            '/station-images/lrt1-gil-puyat.webp',
        ],
        description: 'Gil Puyat station is a massive staging and transfer zone. Placed at the boundary of Manila and Pasay, it is the primary jump-off point for buses heading south to Laguna and Batangas, and jeeps bound for the Makati CBD.',
        history: 'Opened on December 1, 1984. Long known simply as "Buendia station", it was part of the original Baclaran to Central rollout.',
        nameOrigin: 'Named after Senator Gil J. Puyat, a statesman and businessman who served as President of the Philippine Senate. The intersecting avenue was originally Buendia Avenue, hence its lingering colloquial moniker.',
    },
    'L1-03': {
        images: [
            '/station-images/lrt1-libertad.webp',
        ],
        description: 'Libertad station serves the older commercial heart of Pasay City, providing accessibility to the Cartimar Shopping Center and local government complexes.',
        history: 'Opened on December 1, 1984. It captures much of the local residential traffic within the inner barangays of Pasay.',
        nameOrigin: 'Named after the old street name Libertad (which translates to "Liberty" in Spanish), now technically part of Antonio S. Arnaiz Avenue. Locals still stubbornly refer to the entire zone as "Libertad".',
    },
    'L1-02': {
        images: [
            '/station-images/lrt1-edsa.webp',
        ],
        description: 'EDSA station is a critical interchange linking the north-south LRT Line 1 with the circumferential MRT Line 3 (via Taft Avenue station). It is chaotic, dense, and vital to Metro Manila\'s transit flow.',
        history: 'Opened on December 1, 1984. Its significance escalated permanently in 1999 when MRT-3 began operations, transforming it into the primary transfer hub for commuters crossing between the two oldest lines.',
        nameOrigin: 'Named interchangeably for crossing Epifanio de los Santos Avenue (EDSA), the most important highway in Metro Manila. Epifanio de los Santos was a prominent historian, literary critic, and art collector.',
    },
    'L1-01': {
        images: [
            '/station-images/lrt1-baclaran.webp',
        ],
        description: 'Baclaran station served as the grand southern terminal of LRT Line 1 for nearly 40 years. It provides access to the world-famous Baclaran Church and an immense labyrinth of street markets.',
        history: 'Opened on December 1, 1984. It held the title of South Terminal until November 16, 2024, when Phase 1 of the Cavite Extension finally shifted the end of the line down to Parañaque.',
        nameOrigin: 'Named after the Baclaran district. The word "Baclaran" originates from "baklad", a traditional rattan fish trap, echoing the area\'s pre-urbanization history as a coastal fishing village.',
    },
    'L1-21': {
        images: [
            '/station-images/lrt1-redemptorist.webp',
        ],
        description: 'Redemptorist-Aseana station is the first stop on the newly opened Cavite Extension track. Located in Parañaque, it serves the Aseana City business park and provides rear access to the Baclaran Church.',
        history: 'Opened on November 16, 2024, as part of the monumental LRT-1 Cavite Extension Phase 1, a project deeply delayed for decades but finally realized.',
        nameOrigin: 'Named doubly for the Redemptorist Fathers who administer the Baclaran Church, and the Aseana City mixed-use development it physically sits adjacent to.',
    },
    'L1-22': {
        images: [
            '/station-images/lrt1-mia.webp',
        ],
        description: 'MIA Road station brings the LRT network closer to the airport radius, serving Barangay Tambo and connecting to the Entertainment City casino-resort complexes.',
        history: 'Opened on November 16, 2024. Part of the first batch of 5 new stations expanding rail transit into the southern fringes of Metro Manila.',
        nameOrigin: 'Named after MIA Road (Manila International Airport Road), a historical name for the thoroughfare that leads directly to Ninoy Aquino International Airport (formerly MIA).',
    },
    'L1-23': {
        images: [
            '/station-images/lrt1-pitx.webp',
        ],
        description: 'PITX (Asia World) station integrates the heavy rail system with the Parañaque Integrated Terminal Exchange (PITX), Metro Manila\'s first landport handling bus routes to Cavite and Batangas.',
        history: 'Opened on November 16, 2024, finally resolving the missing link between the mass rail transit and the massive provincial bus terminus that opened years prior.',
        nameOrigin: 'Named dually for the PITX terminal itself and "Asia World," after the Asiaworld City development project on the reclaimed land the station sits beside.',
    },
    'L1-24': {
        images: [
            '/station-images/lrt1-ninoy-aquino.webp',
        ],
        description: 'Ninoy Aquino Avenue station cuts through the Santo Niño district of Parañaque built on the east bank of the Parañaque River. It serves deeply residential areas previously untouched by trains.',
        history: 'Opened on November 16, 2024, during the inauguration of the Cavite Extension Phase 1.',
        nameOrigin: 'Named after Ninoy Aquino Avenue passing directly beneath it. The avenue honors Benigno "Ninoy" Aquino Jr., the opposition leader assassinated at the nearby airport tarmac in 1983.',
    },
    'L1-25': {
        images: [
            '/station-images/lrt1-dr-santos.webp',
        ],
        description: 'Dr. Santos station is the current terminus of the LRT-1 system. Located in Parañaque between CAVITEX and C-5 Extension, it features massive intermodal bus facilities.',
        history: 'Opened on November 16, 2024. It will serve as the southernmost limit of the line until Phase 2 (towards Niog in Bacoor, Cavite) becomes a reality, projected for 2031.',
        nameOrigin: 'Named after Dr. Arcadio Santos Avenue (formerly Sucat Road). Dr. Arcadio Santos was a native of Parañaque who served as the governor of Rizal province from 1920 to 1922.',
    },

    // ═══════════════════════════════════════════════════════
    //  LRT-2 (Purple Line)
    // ═══════════════════════════════════════════════════════

    'L2-01': {
        images: [
            '/station-images/lrt2-recto.webp',
        ],
        description: 'Recto station is the western terminus of LRT Line 2, anchored deep into the University Belt. It forms one half of the critical Doroteo Jose–Recto transfer walkway linking LRT-1 and LRT-2.',
        history: 'Opened on October 29, 2004, completing the full original scope of the LRT-2 Megatren project. It replaced Legarda as the western terminus upon its inauguration.',
        nameOrigin: 'Named after Claro M. Recto Avenue. Claro M. Recto was a prominent 20th-century Filipino nationalist, jurist, and legislator known for his fierce advocacy of Philippine sovereignty.',
    },
    'L2-02': {
        images: [
            '/station-images/lrt2-legarda.webp',
        ],
        description: 'Legarda station serves the Sampaloc district in Manila, acting as a primary artery for tens of thousands of students commuting to University Belt institutions like San Beda and Centro Escolar University.',
        history: 'Opened on April 5, 2004, as part of the Phase II development of LRT-2. For roughly six months, it served as the western terminal of the line until Recto was completed in October.',
        nameOrigin: 'Named after Legarda Street. Benito Legarda y Tuason was a Filipino politician and capitalist who became one of the first Filipino resident commissioners to the U.S. Congress.',
    },
    'L2-03': {
        images: [
            '/station-images/lrt2-pureza.webp',
        ],
        description: 'Pureza station offers transit within the Santa Mesa district of Manila. It lies close to the Polytechnic University of the Philippines (PUP) Main Campus and provides access to ferry terminals.',
        history: 'Opened on April 5, 2004, as part of Phase II linking Santolan all the way down to the inner city limits of Manila.',
        nameOrigin: 'Named after the intersecting Pureza Street. "Pureza" is a Spanish word meaning "purity," commonly used as a street designated name in the old grids of Santa Mesa.',
    },
    'L2-04': {
        images: [
            '/station-images/lrt2-v-mapa.webp',
        ],
        description: 'V. Mapa station is situated on Ramon Magsaysay Boulevard in Santa Mesa. It is one of the distinct stations on the line possessing an adjacent reserve track (in front of UERMMC).',
        history: 'Opened on April 5, 2004. During planning, it was originally designated to be called "G. Araneta station" but was renamed V. Mapa due to a slight realignment of the track spacing.',
        nameOrigin: 'Named after Victorino Mapa Street. Victorino Mapa was the 2nd Chief Justice of the Supreme Court of the Philippines and the first Filipino appointed as Secretary of Finance and Justice.',
    },
    'L2-05': {
        images: [
            '/station-images/lrt2-j-ruiz.webp',
        ],
        description: 'J. Ruiz station is the only LRT-2 station situated solely within San Juan City, serving as the main rail gateway for the municipality-turned-city and linking to local jeep routes.',
        history: 'Opened on April 5, 2004. Due to the small footprint of San Juan, J. Ruiz acts as the single primary railway ingress giving the city a direct artery into both Manila and Quezon City.',
        nameOrigin: 'Named after J. Ruiz Street. Juan Ruiz was a noted Katipunero who participated in the Battle of San Juan del Monte, capturing El Polvorin—the Spanish gunpowder depot now commemorated as Pinaglabanan Shrine.',
    },
    'L2-06': {
        images: [
            '/station-images/lrt2-gilmore.webp',
        ],
        description: 'Gilmore station sits in the Mariana district of Quezon City. It is highly associated with Gilmore Avenue, universally known in Manila as the preeminent retail hub for custom PCs and electronics.',
        history: 'Opened on April 5, 2004, expanding the line westward from Araneta Center-Cubao. Its proximity to St. Paul University and the expansive electronics market ensures high mid-day footprint.',
        nameOrigin: 'Named after Gilmore Avenue. The road was named to honor Eugene Allen Gilmore, an American educator who served as Vice Governor-General and twice as Acting Governor-General of the Philippines in the 1920s.',
    },
    'L2-07': {
        images: [
            '/station-images/lrt2-betty-go-belmonte.webp',
        ],
        description: 'Betty Go-Belmonte station is positioned between the heavy hubs of Cubao and Gilmore. It mainly serves the quieter, affluent residential villages of New Manila.',
        history: 'Opened on April 5, 2004. During initial blueprint phases, the station was referred to as "Boston station" based on the intersecting Boston Street, but realignment shifted its position closer to Betty Go-Belmonte Street.',
        nameOrigin: 'Named after Betty Go-Belmonte Street. Betty Go-Belmonte was a prominent Filipina journalist and media executive, best known as the founder of The Philippine Star and wife of House Speaker Feliciano Belmonte.',
    },
    'L2-08': {
        images: [
            '/station-images/lrt2-araneta-cubao.webp',
        ],
        description: 'Araneta Center–Cubao station is an expansive elevated interchange hub linked to MRT-3 via Gateway Mall. It boasts a unique layout containing a third, currently unused platform beneath the main tracks.',
        history: 'Opened on April 5, 2003, as the western terminus of the very first phase of LRT Line 2 (running from Santolan). It later became an interchange when the walkway connecting it to MRT-3 was established.',
        nameOrigin: 'Named after the Araneta Center (now Araneta City) mixed-use estate developed by J. Amado Araneta in the 1950s. "Cubao" stems from "kubo" (nipa hut), a nod to the area\'s pre-war rural state.',
    },
    'L2-09': {
        images: [
            '/station-images/lrt2-anonas.webp',
        ],
        description: 'Anonas station is located in Project 4, Quezon City, offering access to old-style residential blocks and commercial strips like the Anonas Ukay-Ukay (thrift shop) centers.',
        history: 'Opened on April 5, 2003, as part of the initial five-station stretch of the Megatren project linking Santolan to Cubao. In 2019, a nearby rectifier fire temporarily suspended operations but was restored in 2021.',
        nameOrigin: 'Named after Anonas Street. The street derives its name from "Anonas" (Annona reticulata), the custard apple or sugar apple tree, adhering to the Project 2 & 3 convention of naming streets after local flora.',
    },
    'L2-10': {
        images: [
            '/station-images/lrt2-katipunan.webp',
        ],
        description: 'Katipunan station sits entirely underground beneath Katipunan Avenue, making it the only underground station in the LRT system. It is the transit gateway for Ateneo de Manila University and UP Diliman.',
        history: 'Opened on April 5, 2003. Built extensively deep into the adobe rock of Loyola Heights due to the hilly topography. Its structural design sets it apart as a unique brutalist underground cavern.',
        nameOrigin: 'Named after Katipunan Avenue, which is dedicated to the Katipunan (KKK)—the secret revolutionary society founded by Andrés Bonifacio that led the 1896 revolution against Spanish colonial rule.',
    },
    'L2-11': {
        images: [
            '/station-images/lrt2-santolan.webp',
        ],
        description: 'Santolan station features a unique island platform design. Located on the Marikina-Pasig border, it stands beside the sprawling LRT-2 Depot and Operations Control Center.',
        history: 'Opened on April 5, 2003, serving as the eastern terminus for 18 years until the line was finally extended to Antipolo in 2021. It was heavily damaged during Typhoon Ondoy in 2009 due to floodwaters reaching the track level.',
        nameOrigin: 'Named after the barangay of Santolan. "Santolan" originates from the presence of "santol" (cottonfruit) trees that were abundant in the riverside area historically. During planning, it was tentatively called M.A. Roxas station.',
    },
    'L2-12': {
        images: [
            '/station-images/lrt2-marikina-pasig.webp',
        ],
        description: 'Marikina-Pasig station (often just called Marikina) lies along the Marikina-Infanta Highway near the tripoint boundary of Pasig, Marikina, and Cainta.',
        history: 'Opened on July 5, 2021, as part of the long-awaited LRT-2 East Extension project, expanding the reach of the rail network toward Rizal province.',
        nameOrigin: 'Its dual name acknowledges that the station physically straddles the boundary between San Roque, Marikina, and the extremities of Pasig City. Historically referred to simply as the "Emerald" station project.',
    },
    'L2-13': {
        images: [
            '/station-images/lrt2-antipolo.webp',
        ],
        description: 'Antipolo station is the easternmost terminus of LRT Line 2, located at the intersection of Marcos Highway and Sumulong Highway. It is the first and only heavy rail station operating outside Metro Manila.',
        history: 'Opened on July 5, 2021, alongside Marikina station. Previously referred to as Masinag station during its decade-long planning and construction phase.',
        nameOrigin: 'Named for Antipolo, Rizal, the highly urbanized city it serves. The city gets its name from the Tipolo (Artocarpus blancoi) tree, which grows abundantly in the mountainous region.',
    },

    // ═══════════════════════════════════════════════════════
    //  MRT-3 (Yellow Line)
    // ═══════════════════════════════════════════════════════

    'M3-01': {
        images: [
            '/station-images/mrt3-north-avenue.webp',
        ],
        description: 'North Avenue station forms the northern terminus of MRT-3, located beside the massive TriNoma mall. The system\'s underground depot is connected immediately to the north of this station.',
        history: 'Opened on December 15, 1999, as the starting terminal of the initial segment stretching down to Buendia. It is currently being integrated into the upcoming massive Unified Grand Central Station (Common Station).',
        nameOrigin: 'Named after North Avenue, which intersects EDSA directly below. The avenue was part of the original 1940s Frost Plan for Quezon City, marking the northern boundary of the Triangle Park district.',
    },
    'M3-02': {
        images: [
            '/station-images/mrt3-quezon-avenue.webp',
        ],
        description: 'Quezon Avenue station serves the sprawling civic districts of Diliman, Quezon City. It offers direct jeepney links to the Quezon Memorial Circle and the University of the Philippines.',
        history: 'Opened on December 15, 1999, during MRT-3\'s launch phase. It stands as one of the highest volume commuter funnels into Quezon City\'s administrative core.',
        nameOrigin: 'Named after Quezon Avenue, a massive 14-lane thoroughfare named in honor of Manuel L. Quezon, the 2nd President of the Philippines and the founder of the city.',
    },
    'M3-03': {
        images: [
            '/station-images/mrt3-gma-kamuning.webp',
        ],
        description: 'GMA-Kamuning station provides rapid access to the Scout Area of Quezon City. It is positioned adjacent to the GMA Network Center complex.',
        history: 'Opened on December 15, 1999. Originally designated merely as "Kamuning" station, it adopted the GMA prefix informally and then officially due to the sheer landmark dominance of the adjacent broadcasting network.',
        nameOrigin: 'A portmanteau: "GMA" for the Global Media Arts (GMA) Network, and "Kamuning," referencing the nearby barangay and road named after the orange jasmine plant (Murraya paniculata).',
    },
    'M3-04': {
        images: [
            '/station-images/mrt3-araneta-cubao.webp',
        ],
        description: 'Araneta Center-Cubao is the central node of EDSA. Connected deeply into the Farmers Plaza mall, it allows a direct, albeit long, walk to the LRT-2 equivalent station.',
        history: 'Opened on December 15, 1999. It is one of the very few stations on the MRT line where the passenger concourse is located beneath the elevated platforms rather than suspended above it.',
        nameOrigin: 'Named heavily for the Araneta Center business and entertainment district it serves, and Cubao, the historic district that grew out of an agrarian expanse of "kubo" (huts).',
    },
    'M3-05': {
        images: [
            '/station-images/mrt3-santolan-annapolis.webp',
        ],
        description: 'Santolan-Annapolis station straddles the boundary between Quezon City and San Juan. It provides access to the nearby Camp Crame, the national headquarters of the Philippine National Police.',
        history: 'Opened on December 15, 1999. Due to its proximity to tightly packed affluent villages and military camps, it generally posts lower foot traffic compared to other EDSA mainstays.',
        nameOrigin: 'Named for the two streets bounding it: Santolan Road (officially Col. Bonny Serrano Ave, referencing the santol fruit) and Annapolis Street (named after the Maryland home of the US Naval Academy).',
    },
    'M3-06': {
        images: [
            '/station-images/mrt3-ortigas.webp',
        ],
        description: 'Ortigas station acts as the primary northern egress into the Ortigas Center CBD. It is notorious for its extremely narrow eastern pedestrian walkway due to right-of-way constrictions from the Asian Development Bank compound.',
        history: 'Opened on December 15, 1999. Positioned right beside the SM Megamall complex, it absorbs a massive influx of both corporate workforce and mall-going crowds daily.',
        nameOrigin: 'Named for Ortigas Avenue and the Ortigas Center, which originate from the Ortigas family. Francisco Ortigas Jr. spearheaded the transformation of the sprawling 4,033-hectare Mandaluyong estate into a leading CBD.',
    },
    'M3-07': {
        images: [
            '/station-images/mrt3-shaw-boulevard.webp',
        ],
        description: 'Shaw Boulevard station is widely regarded as the central terminal of MRT-3. Situated above the EDSA-Shaw intersection, it connects commuters to the Shangri-La Plaza and Starmall complexes.',
        history: 'Opened on December 15, 1999. Because it sits essentially at the geographic middle of the line, it is uniquely structured with three tracks and two island platforms to permit train staging and turnarounds.',
        nameOrigin: 'Named after Shaw Boulevard. The road honors William F. Shaw, an American businessman and philanthropist who established the Wack Wack Golf and Country Club which the boulevard cuts through.',
    },
    'M3-08': {
        images: [
            '/station-images/mrt3-boni.webp',
        ],
        description: 'Boni station is located in Mandaluyong City. It acts as a gateway for the rapidly verticalizing Pioneer Street corridor, packed with BPO towers and high-density residential high-rises.',
        history: 'Opened on December 15, 1999. It is structured with a concourse above the tracks, wrapping around the twin tunnels of the EDSA-Boni underpass immediately below.',
        nameOrigin: 'Named after Boni Avenue, which intersects EDSA through a tunnel beneath the station. The avenue honors Bonifacio "Boni" Javier, an esteemed World War II guerrilla leader and former mayor of Mandaluyong.',
    },
    'M3-09': {
        images: [
            '/station-images/mrt3-guadalupe.webp',
        ],
        description: 'Guadalupe station hovers over the Pasig River approach in Makati. Surrounded by public markets and a busy ferry station, it is a hectic, high-energy interchange point.',
        history: 'Opened on December 15, 1999. It marks the last elevated station before the line slopes down into the deep Makati tunnel sections.',
        nameOrigin: 'Named after the historic distinct of Guadalupe (divided into Nuevo and Viejo). The name originates from the Our Lady of Guadalupe, a devotion established by traveling Augustinian friars in the 17th century.',
    },
    'M3-10': {
        images: [
            '/station-images/mrt3-buendia.webp',
        ],
        description: 'Buendia station is one of two fully underground stations on the MRT-3 line. It provides direct, subterranean access to the northern perimeter of the Makati Central Business District.',
        history: 'Opened on December 15, 1999. It served as the southern terminus for the first phase of MRT-3 operations for seven months until the final segment to Taft was completed.',
        nameOrigin: 'Named after Buendia Avenue (officially Gil Puyat Avenue). Sen. Gil Puyat renamed the street, but the "Buendia" name (derived from an old Spanish-era family name) stuck firmly in the public consciousness.',
    },
    'M3-11': {
        images: [
            '/station-images/mrt3-ayala.webp',
        ],
        description: 'Ayala station is an underground station acting as the primary heart of the Makati CBD. It is directly bolted into the SM Makati and Ayala Center malls, dispensing hundreds of thousands of corporate employees daily.',
        history: 'Opened on July 20, 2000, bringing MRT-3 to its full functional length. It continuously battles with North Avenue and Cubao for the highest daily ridership in the metropolis.',
        nameOrigin: 'Named heavily for the adjacent Ayala Avenue and Ayala Center. The name traces back to the Ayala family (Zóbel de Ayala), the dynastic industrialist family whose corporation master-planned Makati.',
    },
    'M3-12': {
        images: [
            '/station-images/mrt3-magallanes.webp',
        ],
        description: 'Magallanes station surfaces from the Makati tunnels to an elevated platform near the EDSA-SLEX interchange. It serves commuters heading towards southern Metro Manila and Taguig.',
        history: 'Opened on July 20, 2000. It plays a critical role for transferring passengers to the PNR EDSA railway station, offering a lifeline train-to-train transfer.',
        nameOrigin: 'Named after the nearby Magallanes Village. The village honors Ferdinand Magellan (Fernando de Magallanes), the famed Portuguese explorer who led the Spanish expedition that reached the archipelago in 1521.',
    },
    'M3-13': {
        images: [
            '/station-images/mrt3-taft-avenue.webp',
        ],
        description: 'Taft Avenue station is the southern terminus of MRT Line 3. Found in Pasay City, it intersects with LRT Line 1\'s EDSA station, creating a sprawling, high-chaos transfer concourse.',
        history: 'Opened on July 20, 2000, completing the MRT-3 project. The area around it (Pasay Rotonda) immediately flourished into a dense array of motels, bus terminals, and street markets driven by the pedestrian volume.',
        nameOrigin: 'Named after Taft Avenue. The avenue was constructed during the American era and dedicated to William Howard Taft, the first American Governor-General of the Philippines who later became the 27th U.S. President.',
    },

    // ═══════════════════════════════════════════════════════
    //  MRT-7 (Maroon Line)
    // ═══════════════════════════════════════════════════════

    'M7-01': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/MRT-3_and_LRT-1_Common_Station%2C_North_Avenue%2C_Quezon_City.jpg/800px-MRT-3_and_LRT-1_Common_Station%2C_North_Avenue%2C_Quezon_City.jpg',
        ],
        description: 'The Unified Grand Central Station (Common Station) is the crown jewel interchange of Metro Manila, linking LRT-1, MRT-3, MRT-7, and the Metro Manila Subway into a single massive hub.',
        history: 'After nearly a decade of legal disputes over its final location, construction began in 2017 to finally unify the fragmented northern terminals of the rail network.',
        nameOrigin: 'Its functional name "Common Station" derives from its unique purpose: to be the common terminus and interchange for four separate heavy rail lines.',
    },
    'M7-02': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/MRT-7_Quezon_Memorial_Station_site_%28Elliptical_Road_corner_North_Ave%2C_Quezon_City%29%282018-02-15%29.jpg/800px-MRT-7_Quezon_Memorial_Station_site_%28Elliptical_Road_corner_North_Ave%2C_Quezon_City%29%282018-02-15%29.jpg',
        ],
        description: 'Quezon Memorial station is an underground MRT-7 traversing beneath the Elliptical Road, providing immediate access to the Quezon Memorial Circle national park.',
        history: 'Designed as an underground transition station to preserve the aesthetic and historic skyline of the Quezon Memorial Shrine towering above it.',
        nameOrigin: 'Named after the Quezon Memorial Circle, a national park and shrine dedicated to the second President of the Philippines, Manuel L. Quezon.',
    },
    'M7-03': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/MRT-7_University_Avenue_station_site_%28Commonwealth_Avenue-University_Avenue%2C_UP_Campus%2C_Quezon_City%29%282018-02-15%29.jpg/800px-MRT-7_University_Avenue_station_site_%28Commonwealth_Avenue-University_Avenue%2C_UP_Campus%2C_Quezon_City%29%282018-02-15%29.jpg',
        ],
        description: 'University Avenue serves as the primary gateway for students and faculty of the University of the Philippines Diliman, situated at the entrance of the campus along Commonwealth Avenue.',
        history: 'Its construction required careful rerouting of Commonwealth Avenue traffic, given its position at one of the most critical university intersections in the country.',
        nameOrigin: 'Named inherently after University Avenue, the majestic, tree-lined main thoroughfare leading directly into the sprawling UP Diliman campus.',
    },
    'M7-04': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/MRT-7_Tandang_Sora_Station_site_%28Commonwealth_Avenue-Tandang_Sora_Avenue%2C_Quezon_City%29%282018-02-15%29.jpg/800px-MRT-7_Tandang_Sora_Station_site_%28Commonwealth_Avenue-Tandang_Sora_Avenue%2C_Quezon_City%29%282018-02-15%29.jpg',
        ],
        description: 'Tandang Sora station sits at a historical crossroads, replacing the old Tandang Sora flyover to make way for the elevated rail tracks along Commonwealth.',
        history: 'The construction of this station famously required the demolition of the Tandang Sora flyover and underpass in 2019 to accommodate the MRT-7 columns.',
        nameOrigin: 'Named honoring Melchora Aquino, affectionately known as "Tandang Sora" (Elder Sora), the Grand Woman of the Philippine Revolution who operated a safehouse for Katipuneros.',
    },
    'M7-05': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/MRT-7_Don_Antonio_Station_site_%28Commonwealth_Avenue-Don_Antonio_Drive%2C_Quezon_City%29%282018-02-15%29.jpg/800px-MRT-7_Don_Antonio_Station_site_%28Commonwealth_Avenue-Don_Antonio_Drive%2C_Quezon_City%29%282018-02-15%29.jpg',
        ],
        description: 'Don Antonio station provides mass transit access to the affluent subdivisions of Don Antonio Heights and the heavy residential density of Holy Spirit.',
        history: 'Built as an elevated station along the widest segment of Commonwealth Avenue, often dubbed the "Killer Highway" due to its notorious traffic flow.',
        nameOrigin: 'Named after Don Antonio Drive, the primary access road leading into the sprawling and historic residential complexes of District 2.',
    },
    'M7-06': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/MRT-7_Batasan_Station_site_%28Commonwealth_Avenue-IBP_Road%2C_Quezon_City%29%282018-02-15%29.jpg/800px-MRT-7_Batasan_Station_site_%28Commonwealth_Avenue-IBP_Road%2C_Quezon_City%29%282018-02-15%29.jpg',
        ],
        description: 'Batasan station acts as the primary transit point for government workers commuting to the Batasang Pambansa Complex, the seat of the Philippine House of Representatives.',
        history: 'Strategically located at the intersection of Commonwealth Avenue and IBP Road to serve the complex network of government compounds in the area.',
        nameOrigin: 'Named after the Batasang Pambansa (National Legislature) complex which sits nearby, housing the lower chamber of the Philippine Congress.',
    },
    'M7-07': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Manggahan_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Manggahan_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Manggahan station is nestled in a highly commercialized segment of Commonwealth Avenue, serving the dense populations of Payatas and Litex.',
        history: 'During its construction phase, the vast width of Commonwealth Avenue in this sector allowed for rapid deployment of the station\'s massive concrete girders.',
        nameOrigin: 'Named after the barangay of Manggahan. The name historically denotes a place abundant with "mangga", the Tagalog word for mango trees.',
    },
    'M7-08': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Dona_Carmen_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Dona_Carmen_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Doña Carmen station caters to the Fairview district, sitting adjacent to several subdivisions and mid-rise commercial strips.',
        history: 'Designed to intercept commuters from the deep residential sectors of Fairview, easing the reliance on UV Express vans and jeepneys along the highway.',
        nameOrigin: 'Named after the Doña Carmen subdivision. The honorific "Doña" denotes a matriarch or woman of high standing in Spanish-colonial societal naming conventions.',
    },
    'M7-09': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Regalado_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Regalado_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Regalado station marks the transition where MRT-7 drifts away from Commonwealth Avenue and curves into the Regalado Highway corridor.',
        history: 'Its location serves as a crucial transit funnel for the myriad of gated communities and shopping plazas scattered throughout North Fairview.',
        nameOrigin: 'Named directly after the intersecting Regalado Highway, which honors the Regalado family, prominent local landowners in the mid-20th century.',
    },
    'M7-10': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Mindanao_Avenue_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Mindanao_Avenue_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Mindanao Avenue station provides rail access to the vast SM City Fairview supermall complex, creating a massive intermodal hub for northern Quezon City.',
        history: 'Strategically embedded near the confluence of three major shopping malls (SM, Ayala Terraces, Robinsons) to capture the dense retail weekend foot traffic.',
        nameOrigin: 'Named after Mindanao Avenue, continuing the Quezon City tradition of naming major northern avenues after the primary island groups of the Philippine archipelago.',
    },
    'M7-11': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Quirino_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Quirino_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Quirino station is situated along Quirino Highway in the deeply urbanized Novaliches area, a sector completely reliant on road transport prior to MRT-7.',
        history: 'The tight right-of-way along Quirino Highway presented massive engineering challenges during the station’s structural blueprinting and girder installation.',
        nameOrigin: 'Named after Quirino Highway, an ancient arterial road honoring Elpidio Quirino, the 6th President of the Philippines.',
    },
    'M7-12': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Sacred_Heart_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Sacred_Heart_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Sacred Heart station serves the northern fringes of Caloocan (North Caloocan) and Quezon City, an area historically infamous for paralyzing traffic bottlenecks.',
        history: 'The station acts as a pressure relief valve for the Lagro and Amparo subdivisions, giving residents their first-ever heavy rail connection to the CBDs.',
        nameOrigin: 'Named after the nearby Sacred Heart Village and the local parish, invoking the Catholic devotion to the Sacred Heart of Jesus.',
    },
    'M7-13': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Tala_Station_%28Mrt-7%29_-_January_2022.jpg/800px-Tala_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'Tala station brings transit accessibility to the historic Tala Leprosarium estate and the massive resettlement areas of Northern Caloocan.',
        history: 'This station bridges the geographical disconnect between the sprawling, isolated North Caloocan districts and the rest of the highly-connected Metro Manila matrix.',
        nameOrigin: 'Named after the Tala district, originally established in the 1940s as a leper colony. The word "tala" translates to "star" in Tagalog.',
    },
    'M7-14': {
        images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/San_Jose_del_Monte_Station_%28Mrt-7%29_-_January_2022.jpg/800px-San_Jose_del_Monte_Station_%28Mrt-7%29_-_January_2022.jpg',
        ],
        description: 'San Jose del Monte station is the northernmost terminus of the MRT-7 line. Located in Bulacan province, it connects suburban commuters into the massive web of Metro Manila.',
        history: 'After numerous realignments regarding its exact sitting within Bulacan, it was confirmed to rise near the Colinas Verdes estate to intercept commuters from the province.',
        nameOrigin: 'Named after the highly urbanized city of San Jose del Monte in Bulacan. The name translates from Spanish as "Saint Joseph of the Mountain".',
    },
};
