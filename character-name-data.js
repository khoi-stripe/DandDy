// ========================================
// SHARED CHARACTER NAME DATA
// ========================================
// Fantasy name patterns for D&D races.
// Used by AIService.generateFallbackNames for offline name generation.

const CharacterNameData = (window.CharacterNameData = {
  // Name patterns indexed by race
  patterns: {
    dwarf: {
      first: [
        'Thorin', 'Gimli', 'Balin', 'Dwalin', 'Thrain', 'Dain', 'Bombur',
        'Bofur', 'Kili', 'Fili', 'Oin', 'Gloin', 'Bruenor', 'Morgran',
        'Rurik', 'Einkil', 'Barendd', 'Baern', 'Harbek', 'Rumnar',
      ],
      last: [
        'Ironforge', 'Stonehelm', 'Deepdelver', 'Mountainheart', 'Goldseeker',
        'Ironfoot', 'Hammerhand', 'Oakenshield', 'Battlehammer', 'Fireforge',
        'Stormdelver', 'Stonebreaker', 'Coppervein', 'Bronzebrow', 'Rockseeker',
      ],
    },
    elf: {
      first: [
        'Legolas', 'Galadriel', 'Elrond', 'Arwen', 'Thranduil', 'Celeborn',
        'Elessar', 'Elendil', 'Finrod', 'Luthien', 'Faelar', 'Aelar',
        'Mialee', 'Syllin', 'Thia', 'Varis', 'Althaea', 'Enna', 'Nelar',
      ],
      last: [
        'Greenleaf', 'Starweaver', 'Moonwhisper', 'Silverbow', 'Nightbreeze',
        'Sunshadow', 'Stormwind', 'Brightwood', 'Dawnpetal', 'Evenwood',
        'Silverfrond', 'Nightstar', 'Willowshade', 'Starfall', 'Moonbrook',
      ],
    },
    human: {
      first: [
        'Aragorn', 'Boromir', 'Eowyn', 'Faramir', 'Theodred', 'Eomer',
        'Eddard', 'Catelyn', 'Jon', 'Sansa', 'Alaric', 'Rowan', 'Serena',
        'Garrick', 'Lysa', 'Marcus', 'Elena', 'Corin', 'Brynn',
      ],
      last: [
        'Stormborn', 'Blackwood', 'Riverrun', 'Ironwall', 'Longstrider',
        'Stormblade', 'Brightshield', 'Greywind', 'Highvale', 'Steelguard',
        'Duskwalker', 'Redcrest', 'Stoneward', 'Ashborne', 'Hawkspear',
      ],
    },
    halfling: {
      first: [
        'Bilbo', 'Frodo', 'Sam', 'Merry', 'Pippin', 'Rosie', 'Hamfast',
        'Belladonna', 'Lobelia', 'Fredegar', 'Milo', 'Daisy', 'Rosa',
        'Cora', 'Perrin', 'Tansy', 'Dodo', 'Seraphina', 'Odo',
      ],
      last: [
        'Baggins', 'Took', 'Brandybuck', 'Gamgee', 'Goodbody', 'Proudfoot',
        'Burrows', 'Underhill', 'Greenhill', 'Fairbairn', 'Hilltopple',
        'Brushgather', 'Tealeaf', 'Thorngage', 'Goodbarrel', 'Hearthcoat',
      ],
    },
    dragonborn: {
      first: [
        'Drax', 'Razax', 'Thordak', 'Torinn', 'Balasar', 'Kriv', 'Nadarr',
        'Heskan', 'Shedinn', 'Ghesh', 'Arjhan', 'Medrash', 'Rhogar',
        'Tarhun', 'Akra', 'Miirym', 'Sora', 'Vezera', 'Zorvath',
      ],
      last: [
        'Flameheart', 'Ironclaw', 'Stormsinger', 'Ashborn', 'Dragonfall',
        'Firebreath', 'Scaleborn', 'Wyrmblood', 'Skyscale', 'Embermaw',
        'Stormscale', 'Brightflame', 'Stoneclaw', 'Cloudsunder', 'Blazewing',
      ],
    },
    gnome: {
      first: [
        'Glim', 'Boddynock', 'Dimble', 'Fonkin', 'Seebo', 'Zook', 'Eldon',
        'Brocc', 'Burgell', 'Jebeddo', 'Alston', 'Bimpnottin', 'Fizzik',
        'Carlin', 'Nissa', 'Wrenn', 'Tavi', 'Ellyjobell', 'Zanna',
      ],
      last: [
        'Tinkertop', 'Sparklegem', 'Nimblefingers', 'Brightgear', 'Gadgetwhiz',
        'Fizzlebang', 'Cogsworth', 'Glimmergold', 'Whistlewhirr', 'Gadgetgrind',
        'Janglecoin', 'Copperbolt', 'Mithrilspanner', 'Quickwidget', 'Proudgear',
      ],
    },
    'half-elf': {
      first: [
        'Tanis', 'Raistlin', 'Laurana', 'Gilthanas', 'Tanthalas', 'Silvara',
        'Eliana', 'Korrin', 'Faelyn', 'Soveliss', 'Ilanis', 'Kael', 'Myla',
        'Tharos', 'Elira', 'Daeris', 'Rian', 'Caelynn', 'Torren',
      ],
      last: [
        'Half-Elven', 'Moonbrook', 'Starfall', 'Whisperwind', 'Shadowvale',
        'Dawnbringer', 'Twilightbane', 'Silvermoon', 'Nightbloom', 'Duskwillow',
        'Starcrest', 'Eveningfall', 'Shadeglade', 'Brightglen', 'Silvershade',
      ],
    },
    'half-orc': {
      first: [
        'Grognak', 'Throk', 'Ugak', 'Krod', 'Sharn', 'Dench', 'Grul', 'Drog',
        'Feng', 'Shump', 'Ghorbash', 'Mazog', 'Uglar', 'Ruk', 'Karash',
        'Vorag', 'Yagra', 'Shautha', 'Ovak',
      ],
      last: [
        'Ironhide', 'Bonecrusher', 'Skullsplitter', 'Bloodaxe', 'Stonefist',
        'Grimjaw', 'Warbringer', 'Doomhammer', 'Boulderfist', 'Skullbrand',
        'Gorefang', 'Bloodfury', 'Ironmaw', 'Steelgrip', 'Rageborn',
      ],
    },
    tiefling: {
      first: [
        'Zevlor', 'Raven', 'Damakos', 'Akta', 'Therai', 'Nemeia', 'Kallista',
        'Leucis', 'Orianna', 'Morthos', 'Azazel', 'Seraphine', 'Xathos',
        'Riven', 'Lyra', 'Caelum', 'Naeris', 'Vexria', 'Zheren',
      ],
      last: [
        'Hellborn', 'Darkflame', 'Shadowhorn', 'Nightwhisper', 'Embersoul',
        'Dreadfire', 'Ashenborn', 'Voidwalker', 'Grimshroud', 'Duskwreath',
        'Soulbrand', 'Cindertongue', 'Nightreign', 'Gloomsigil', 'Shadebinder',
      ],
    },
  },

  /**
   * Get the name pattern for a race.
   * Falls back to human names if the race isn't found.
   * @param {string} race - The character race
   * @returns {{ first: string[], last: string[] }}
   */
  getPattern(race) {
    const key = (race || '').toLowerCase();
    return this.patterns[key] || this.patterns.human;
  },

  /**
   * Get all available races.
   * @returns {string[]}
   */
  getRaces() {
    return Object.keys(this.patterns);
  },
});

