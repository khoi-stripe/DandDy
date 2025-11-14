import SwiftUI

struct MacCharacterDetailView: View {
    let character: Character
    @StateObject private var viewModel = CharacterViewModel()
    @State private var selectedTab: DetailTab = .stats
    
    enum DetailTab: String, CaseIterable {
        case stats = "Stats"
        case combat = "Combat"
        case inventory = "Inventory"
        case spells = "Spells"
        case notes = "Notes"
        
        var icon: String {
            switch self {
            case .stats: return "person.fill"
            case .combat: return "shield.fill"
            case .inventory: return "backpack.fill"
            case .spells: return "sparkles"
            case .notes: return "doc.text.fill"
            }
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(character.name)
                        .font(.title)
                        .fontWeight(.bold)
                    
                    HStack(spacing: 8) {
                        Text("\(character.race) \(character.characterClass)")
                            .font(.headline)
                            .foregroundColor(.secondary)
                        
                        Text("•")
                            .foregroundColor(.secondary)
                        
                        Text("Level \(character.level)")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                // Quick stats
                HStack(spacing: 20) {
                    QuickStatBadge(
                        icon: "heart.fill",
                        label: "HP",
                        value: "\(character.hitPointsCurrent)/\(character.hitPointsMax)",
                        color: hpColor
                    )
                    
                    QuickStatBadge(
                        icon: "shield.fill",
                        label: "AC",
                        value: "\(character.armorClass)",
                        color: .blue
                    )
                    
                    QuickStatBadge(
                        icon: "bolt.fill",
                        label: "Init",
                        value: "\(character.initiative >= 0 ? "+" : "")\(character.initiative)",
                        color: .yellow
                    )
                }
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            // Tab selection
            Picker("", selection: $selectedTab) {
                ForEach(DetailTab.allCases, id: \.self) { tab in
                    Label(tab.rawValue, systemImage: tab.icon)
                        .tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding()
            
            // Tab content
            ScrollView {
                Group {
                    switch selectedTab {
                    case .stats:
                        MacCharacterStatsView(character: character, viewModel: viewModel)
                    case .combat:
                        MacCombatView(character: character, viewModel: viewModel)
                    case .inventory:
                        MacInventoryView(character: character, viewModel: viewModel)
                    case .spells:
                        MacSpellsView(character: character, viewModel: viewModel)
                    case .notes:
                        MacNotesView(character: character)
                    }
                }
                .padding()
            }
        }
    }
    
    private var hpColor: Color {
        let percentage = Double(character.hitPointsCurrent) / Double(character.hitPointsMax)
        if percentage > 0.5 { return .green }
        else if percentage > 0.25 { return .orange }
        else { return .red }
    }
}

struct QuickStatBadge: View {
    let icon: String
    let label: String
    let value: String
    let color: Color
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(color)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(value)
                    .font(.headline)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor).opacity(0.5))
        .cornerRadius(8)
    }
}

// MARK: - Stats View
struct MacCharacterStatsView: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var body: some View {
        VStack(spacing: 24) {
            // Ability Scores
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 6), spacing: 16) {
                AbilityScoreCard(name: "STR", score: character.strength)
                AbilityScoreCard(name: "DEX", score: character.dexterity)
                AbilityScoreCard(name: "CON", score: character.constitution)
                AbilityScoreCard(name: "INT", score: character.intelligence)
                AbilityScoreCard(name: "WIS", score: character.wisdom)
                AbilityScoreCard(name: "CHA", score: character.charisma)
            }
            
            Divider()
            
            // Saving Throws and Skills side by side
            HStack(alignment: .top, spacing: 24) {
                // Saving Throws
                VStack(alignment: .leading, spacing: 12) {
                    Text("Saving Throws")
                        .font(.headline)
                    
                    ForEach(["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"], id: \.self) { ability in
                        SavingThrowRow(
                            ability: ability,
                            score: abilityScore(for: ability),
                            isProficient: character.savingThrowProficiencies.contains(ability.lowercased()),
                            profBonus: viewModel.proficiencyBonus(level: character.level)
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                Divider()
                
                // Skills
                VStack(alignment: .leading, spacing: 12) {
                    Text("Skills")
                        .font(.headline)
                    
                    LazyVGrid(columns: [GridItem(.flexible())], spacing: 8) {
                        ForEach(D5eData.skills, id: \.self) { skill in
                            SkillRow(
                                skill: skill,
                                character: character,
                                profBonus: viewModel.proficiencyBonus(level: character.level)
                            )
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
    
    private func abilityScore(for ability: String) -> Int {
        switch ability {
        case "Strength": return character.strength
        case "Dexterity": return character.dexterity
        case "Constitution": return character.constitution
        case "Intelligence": return character.intelligence
        case "Wisdom": return character.wisdom
        case "Charisma": return character.charisma
        default: return 10
        }
    }
}

// MARK: - Combat View
struct MacCombatView: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    @State private var damageAmount = ""
    @State private var healAmount = ""
    @State private var tempHPAmount = ""
    @State private var showingConditions = false
    
    var body: some View {
        VStack(spacing: 24) {
            // HP Management
            GroupBox("Hit Points") {
                VStack(spacing: 16) {
                    // HP Display
                    HStack(spacing: 30) {
                        VStack(spacing: 8) {
                            Text("Current")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("\(character.hitPointsCurrent)")
                                .font(.system(size: 48, weight: .bold))
                                .foregroundColor(hpColor)
                        }
                        
                        Text("/")
                            .font(.title)
                            .foregroundColor(.secondary)
                        
                        VStack(spacing: 8) {
                            Text("Maximum")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("\(character.hitPointsMax)")
                                .font(.system(size: 48, weight: .bold))
                        }
                        
                        if character.hitPointsTemp > 0 {
                            Divider()
                                .frame(height: 60)
                            
                            VStack(spacing: 8) {
                                Image(systemName: "shield.fill")
                                    .foregroundColor(.blue)
                                Text("Temp")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Text("\(character.hitPointsTemp)")
                                    .font(.title2)
                                    .bold()
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    
                    ProgressView(value: Double(character.hitPointsCurrent), total: Double(character.hitPointsMax))
                        .tint(hpColor)
                        .scaleEffect(x: 1, y: 2)
                    
                    // HP Controls
                    HStack(spacing: 16) {
                        VStack(spacing: 8) {
                            TextField("Damage", text: $damageAmount)
                                .textFieldStyle(.roundedBorder)
                            Button("Take Damage") {
                                applyDamage()
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.red)
                        }
                        
                        VStack(spacing: 8) {
                            TextField("Heal", text: $healAmount)
                                .textFieldStyle(.roundedBorder)
                            Button("Heal") {
                                applyHealing()
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                        }
                        
                        VStack(spacing: 8) {
                            TextField("Temp HP", text: $tempHPAmount)
                                .textFieldStyle(.roundedBorder)
                            Button("Set Temp HP") {
                                setTempHP()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .padding()
            }
            
            // Death Saves
            if character.hitPointsCurrent == 0 {
                GroupBox("Death Saving Throws") {
                    HStack(spacing: 40) {
                        VStack(spacing: 12) {
                            Text("Successes")
                                .font(.headline)
                            HStack(spacing: 8) {
                                ForEach(0..<3) { index in
                                    Image(systemName: index < character.deathSaveSuccesses ? "checkmark.circle.fill" : "circle")
                                        .font(.title)
                                        .foregroundColor(index < character.deathSaveSuccesses ? .green : .gray)
                                        .onTapGesture {
                                            toggleDeathSave(success: true, index: index)
                                        }
                                }
                            }
                        }
                        
                        VStack(spacing: 12) {
                            Text("Failures")
                                .font(.headline)
                            HStack(spacing: 8) {
                                ForEach(0..<3) { index in
                                    Image(systemName: index < character.deathSaveFailures ? "xmark.circle.fill" : "circle")
                                        .font(.title)
                                        .foregroundColor(index < character.deathSaveFailures ? .red : .gray)
                                        .onTapGesture {
                                            toggleDeathSave(success: false, index: index)
                                        }
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                }
            }
            
            // Conditions
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Conditions")
                            .font(.headline)
                        Spacer()
                        Button(action: { showingConditions = true }) {
                            Image(systemName: "plus.circle.fill")
                        }
                        .buttonStyle(.borderless)
                    }
                    
                    if character.conditions.isEmpty {
                        Text("No active conditions")
                            .foregroundColor(.secondary)
                    } else {
                        FlowLayout(spacing: 8) {
                            ForEach(character.conditions, id: \.self) { condition in
                                HStack(spacing: 6) {
                                    Text(condition)
                                        .font(.caption)
                                    Button(action: {
                                        removeCondition(condition)
                                    }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.caption)
                                    }
                                    .buttonStyle(.borderless)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.orange)
                                .foregroundColor(.white)
                                .cornerRadius(15)
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .sheet(isPresented: $showingConditions) {
            ConditionsSheet(character: character, viewModel: viewModel, isPresented: $showingConditions)
                .frame(width: 400, height: 500)
        }
    }
    
    private var hpColor: Color {
        let percentage = Double(character.hitPointsCurrent) / Double(character.hitPointsMax)
        if percentage > 0.5 { return .green }
        else if percentage > 0.25 { return .orange }
        else { return .red }
    }
    
    private func applyDamage() {
        guard let damage = Int(damageAmount) else { return }
        let newHP = max(0, character.hitPointsCurrent - damage)
        Task {
            await viewModel.updateCharacter(id: character.id, updates: ["hit_points_current": newHP])
        }
        damageAmount = ""
    }
    
    private func applyHealing() {
        guard let heal = Int(healAmount) else { return }
        let newHP = min(character.hitPointsMax, character.hitPointsCurrent + heal)
        Task {
            await viewModel.updateCharacter(id: character.id, updates: ["hit_points_current": newHP])
        }
        healAmount = ""
    }
    
    private func setTempHP() {
        guard let tempHP = Int(tempHPAmount) else { return }
        Task {
            await viewModel.updateCharacter(id: character.id, updates: ["hit_points_temp": tempHP])
        }
        tempHPAmount = ""
    }
    
    private func toggleDeathSave(success: Bool, index: Int) {
        if success {
            let current = character.deathSaveSuccesses
            let new = index < current ? current - 1 : current + 1
            Task {
                await viewModel.updateCharacter(id: character.id, updates: ["death_save_successes": min(3, max(0, new))])
            }
        } else {
            let current = character.deathSaveFailures
            let new = index < current ? current - 1 : current + 1
            Task {
                await viewModel.updateCharacter(id: character.id, updates: ["death_save_failures": min(3, max(0, new))])
            }
        }
    }
    
    private func removeCondition(_ condition: String) {
        var conditions = character.conditions
        conditions.removeAll { $0 == condition }
        Task {
            await viewModel.updateCharacter(id: character.id, updates: ["conditions": conditions])
        }
    }
}

// MARK: - Other Views (simplified versions)
struct MacInventoryView: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var body: some View {
        GroupBox("Currency & Inventory") {
            VStack(alignment: .leading, spacing: 16) {
                // Currency
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                    CurrencyBadge(name: "PP", amount: character.platinumPieces, color: .gray)
                    CurrencyBadge(name: "GP", amount: character.goldPieces, color: .yellow)
                    CurrencyBadge(name: "EP", amount: character.electrumPieces, color: .green)
                    CurrencyBadge(name: "SP", amount: character.silverPieces, color: .gray)
                    CurrencyBadge(name: "CP", amount: character.copperPieces, color: .brown)
                }
                
                if !character.inventory.isEmpty {
                    Divider()
                    Text("Items")
                        .font(.headline)
                    
                    ForEach(character.inventory.indices, id: \.self) { index in
                        if let item = character.inventory[index] as? [String: String] {
                            HStack {
                                Text(item["name"] ?? "Unknown Item")
                                Spacer()
                                if let weight = item["weight"] {
                                    Text("\(weight) lbs")
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        }
    }
}

struct CurrencyBadge: View {
    let name: String
    let amount: Int
    let color: Color
    
    var body: some View {
        VStack(spacing: 4) {
            Text(name)
                .font(.caption)
                .foregroundColor(.secondary)
            Text("\(amount)")
                .font(.title3)
                .bold()
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(color.opacity(0.1))
        .cornerRadius(8)
    }
}

struct MacSpellsView: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var body: some View {
        GroupBox("Spellcasting") {
            VStack(alignment: .leading, spacing: 16) {
                if let _ = character.spellcastingAbility {
                    HStack(spacing: 20) {
                        VStack {
                            Text("Spell Save DC")
                                .font(.caption)
                            Text("\(character.spellSaveDc ?? 0)")
                                .font(.title2)
                                .bold()
                        }
                        
                        VStack {
                            Text("Spell Attack")
                                .font(.caption)
                            Text("+\(character.spellAttackBonus ?? 0)")
                                .font(.title2)
                                .bold()
                        }
                    }
                    
                    if !character.spellSlots.isEmpty {
                        Divider()
                        Text("Spell Slots")
                            .font(.headline)
                        
                        ForEach(character.spellSlots.keys.sorted(), id: \.self) { level in
                            if let total = character.spellSlots[level],
                               let used = character.spellSlotsUsed[level] {
                                HStack {
                                    Text("Level \(level)")
                                    Spacer()
                                    Text("\(total - used) / \(total)")
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                } else {
                    Text("No spellcasting ability")
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        }
    }
}

struct MacNotesView: View {
    let character: Character
    
    var body: some View {
        VStack(spacing: 16) {
            if let appearance = character.appearance, !appearance.isEmpty {
                GroupBox("Appearance") {
                    Text(appearance)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
            }
            
            if let backstory = character.backstory, !backstory.isEmpty {
                GroupBox("Backstory") {
                    Text(backstory)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
            }
            
            if let personality = character.personalityTraits, !personality.isEmpty {
                GroupBox("Personality") {
                    Text(personality)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
            }
        }
    }
}


