# Character Sheet Parity

This document tracks which character information is displayed in the Builder vs Manager apps.

## ✅ Complete Parity

Both apps now display the same character sheet information from the enhanced export format.

### Character Sheet Sections (Both Apps)

#### 1. Portrait
- **ASCII Art Portrait** - Displayed at top of sheet (if available)
- **Original Portrait URL** - Stored but not displayed inline

#### 2. Basic Information
- Name (as title)
- Race (with size in parentheses if available)
- Class (with primary ability in parentheses if available)
- Level (with ✨ indicator for spellcasters)
- Background
- Alignment

#### 3. Combat Stats (Grid)
- Hit Points (current/max)
- Armor Class
- Initiative (with modifier)
- Speed (feet)
- Proficiency Bonus
- Hit Die

#### 4. Ability Scores (Grid)
- All 6 abilities (STR, DEX, CON, INT, WIS, CHA)
- Score value
- Modifier in parentheses

#### 5. Saving Throws
- All 6 saving throws with calculated modifiers
- ★ indicator marks proficient saves

#### 6. Skills
- All proficient skills listed
- Calculated modifiers (ability + proficiency bonus)
- ★ indicator marks proficiency

#### 7. Racial Traits
- List of all racial traits from race data
- Pulled from DND_DATA

#### 8. Equipment
- Starting equipment from character creation
- Class equipment from class data
- Deduplicated list

#### 9. Tool Proficiencies
- List of all tool proficiencies
- Formatted display names

#### 10. Languages
- Race languages
- Background languages
- Additional chosen languages

#### 11. Background Description
- Full background description (if in enhanced export)

#### 12. Background Feature
- Feature name (bolded)
- Feature description

#### 13. Backstory
- Character's backstory/personality

#### 14. Export Info
- Export date
- Exported by (source app)
- Export version

## Export Format

### Enhanced Export includes:
```javascript
{
  // Metadata
  exportVersion: "1.0",
  exportDate: "ISO timestamp",
  exportedBy: "DandDy Character Builder v1.4",
  
  // Original character data
  name, race, class, background, alignment,
  abilities, level, hitPoints, backstory,
  skillProficiencies, toolProficiencies,
  languages, equipment, backgroundFeature,
  
  // Calculated stats
  abilityModifiers: {},
  proficiencyBonus: 2,
  initiative: 2,
  armorClass: 12,
  speed: 30,
  
  // Skills with modifiers
  skillModifiers: {},
  
  // Saving throws
  savingThrows: [],
  savingThrowModifiers: {},
  
  // Expanded data from DND_DATA
  raceData: {
    name, size, speed, traits, languages
  },
  classData: {
    name, hitDie, primaryAbility, savingThrows,
    skills, equipment, spellcaster
  },
  backgroundData: {
    name, description, feature,
    skillProficiencies, toolProficiencies,
    languages, equipment
  },
  
  // Portrait data
  portrait: {
    ascii: "...",
    original: "url"
  }
}
```

## Backward Compatibility

Both apps support the old format:
- `abilityScores` → `abilities`
- Simple `hitPoints` number → object with current/max
- Flat `race`/`class` strings → nested `raceData`/`classData`
- Missing calculated values are computed on the fly

## App-Specific Features

### Builder Only
- Interactive character creation workflow
- Question/answer system
- Narrator guidance
- AI portrait generation
- Print to PDF
- Live editing during creation

### Manager Only
- Character list/grid view
- Search and filter
- Sort options
- Quick duplicate
- Batch operations
- Side-by-side viewing

### Shared Features
- Full character sheet display
- Export to JSON
- Delete character
- View all stats and details




