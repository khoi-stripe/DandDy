import SwiftUI

struct CharacterSheetView: View {
    let character: Character
    @StateObject private var viewModel = CharacterViewModel()
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            CharacterStatsTab(character: character, viewModel: viewModel)
                .tabItem {
                    Label("Stats", systemImage: "person.fill")
                }
                .tag(0)
            
            CombatTab(character: character, viewModel: viewModel)
                .tabItem {
                    Label("Combat", systemImage: "shield.fill")
                }
                .tag(1)
            
            InventoryTab(character: character, viewModel: viewModel)
                .tabItem {
                    Label("Inventory", systemImage: "backpack.fill")
                }
                .tag(2)
            
            SpellsTab(character: character, viewModel: viewModel)
                .tabItem {
                    Label("Spells", systemImage: "sparkles")
                }
                .tag(3)
            
            NotesTab(character: character)
                .tabItem {
                    Label("Notes", systemImage: "doc.text.fill")
                }
                .tag(4)
        }
        .navigationTitle(character.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Stats Tab

struct CharacterStatsTab: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header
                VStack(spacing: 8) {
                    Text(character.name)
                        .font(.title)
                        .bold()
                    
                    Text("\(character.race) \(character.characterClass)")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    
                    Text("Level \(character.level) | \(character.alignment?.displayName ?? "No Alignment")")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding()
                
                // Ability Scores
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 15) {
                    AbilityScoreCard(name: "STR", score: character.strength)
                    AbilityScoreCard(name: "DEX", score: character.dexterity)
                    AbilityScoreCard(name: "CON", score: character.constitution)
                    AbilityScoreCard(name: "INT", score: character.intelligence)
                    AbilityScoreCard(name: "WIS", score: character.wisdom)
                    AbilityScoreCard(name: "CHA", score: character.charisma)
                }
                .padding(.horizontal)
                
                // Combat Stats
                VStack(spacing: 12) {
                    HStack(spacing: 20) {
                        StatCard(title: "AC", value: "\(character.armorClass)", icon: "shield.fill", color: .blue)
                        StatCard(title: "Initiative", value: "\(character.initiative >= 0 ? "+" : "")\(character.initiative)", icon: "bolt.fill", color: .yellow)
                        StatCard(title: "Speed", value: "\(character.speed) ft", icon: "hare.fill", color: .green)
                    }
                    
                    StatCard(
                        title: "Proficiency Bonus",
                        value: "+\(viewModel.proficiencyBonus(level: character.level))",
                        icon: "star.fill",
                        color: .purple
                    )
                }
                .padding(.horizontal)
                
                // Saving Throws
                VStack(alignment: .leading, spacing: 8) {
                    Text("Saving Throws")
                        .font(.headline)
                        .padding(.horizontal)
                    
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        SavingThrowRow(ability: "Strength", score: character.strength, isProficient: character.savingThrowProficiencies.contains("strength"), profBonus: viewModel.proficiencyBonus(level: character.level))
                        SavingThrowRow(ability: "Dexterity", score: character.dexterity, isProficient: character.savingThrowProficiencies.contains("dexterity"), profBonus: viewModel.proficiencyBonus(level: character.level))
                        SavingThrowRow(ability: "Constitution", score: character.constitution, isProficient: character.savingThrowProficiencies.contains("constitution"), profBonus: viewModel.proficiencyBonus(level: character.level))
                        SavingThrowRow(ability: "Intelligence", score: character.intelligence, isProficient: character.savingThrowProficiencies.contains("intelligence"), profBonus: viewModel.proficiencyBonus(level: character.level))
                        SavingThrowRow(ability: "Wisdom", score: character.wisdom, isProficient: character.savingThrowProficiencies.contains("wisdom"), profBonus: viewModel.proficiencyBonus(level: character.level))
                        SavingThrowRow(ability: "Charisma", score: character.charisma, isProficient: character.savingThrowProficiencies.contains("charisma"), profBonus: viewModel.proficiencyBonus(level: character.level))
                    }
                    .padding(.horizontal)
                }
                
                // Skills
                VStack(alignment: .leading, spacing: 8) {
                    Text("Skills")
                        .font(.headline)
                        .padding(.horizontal)
                    
                    LazyVGrid(columns: [GridItem(.flexible())], spacing: 8) {
                        ForEach(D5eData.skills, id: \.self) { skill in
                            SkillRow(
                                skill: skill,
                                character: character,
                                profBonus: viewModel.proficiencyBonus(level: character.level)
                            )
                        }
                    }
                    .padding(.horizontal)
                }
                
                Spacer()
            }
        }
    }
}

struct AbilityScoreCard: View {
    let name: String
    let score: Int
    
    var modifier: Int {
        DiceRoller.calculateModifier(score)
    }
    
    var body: some View {
        VStack(spacing: 4) {
            Text(name)
                .font(.caption)
                .foregroundColor(.secondary)
            
            Text("\(modifier >= 0 ? "+" : "")\(modifier)")
                .font(.title)
                .bold()
            
            Text("\(score)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(color)
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.title3)
                .bold()
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

struct SavingThrowRow: View {
    let ability: String
    let score: Int
    let isProficient: Bool
    let profBonus: Int
    
    var modifier: Int {
        let base = DiceRoller.calculateModifier(score)
        return base + (isProficient ? profBonus : 0)
    }
    
    var body: some View {
        HStack {
            Image(systemName: isProficient ? "checkmark.circle.fill" : "circle")
                .foregroundColor(isProficient ? .blue : .gray)
            
            Text(ability)
                .font(.subheadline)
            
            Spacer()
            
            Text("\(modifier >= 0 ? "+" : "")\(modifier)")
                .font(.subheadline)
                .bold()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 12)
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

struct SkillRow: View {
    let skill: String
    let character: Character
    let profBonus: Int
    
    private var isProficient: Bool {
        character.skillProficiencies.contains(skill)
    }
    
    private var isExpert: Bool {
        character.skillExpertises.contains(skill)
    }
    
    private var modifier: Int {
        let abilityName = D5eData.skillAbilities[skill] ?? "strength"
        var abilityScore = 10
        
        switch abilityName {
        case "strength": abilityScore = character.strength
        case "dexterity": abilityScore = character.dexterity
        case "constitution": abilityScore = character.constitution
        case "intelligence": abilityScore = character.intelligence
        case "wisdom": abilityScore = character.wisdom
        case "charisma": abilityScore = character.charisma
        default: break
        }
        
        let base = DiceRoller.calculateModifier(abilityScore)
        if isExpert {
            return base + (profBonus * 2)
        } else if isProficient {
            return base + profBonus
        }
        return base
    }
    
    var body: some View {
        HStack {
            Image(systemName: isExpert ? "star.circle.fill" : (isProficient ? "checkmark.circle.fill" : "circle"))
                .foregroundColor(isExpert ? .yellow : (isProficient ? .blue : .gray))
            
            Text(skill)
                .font(.subheadline)
            
            Spacer()
            
            Text("\(modifier >= 0 ? "+" : "")\(modifier)")
                .font(.subheadline)
                .bold()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 12)
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

// MARK: - Combat Tab

struct CombatTab: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    @State private var damageAmount = ""
    @State private var healAmount = ""
    @State private var tempHPAmount = ""
    @State private var showingConditions = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // HP Management
                VStack(spacing: 15) {
                    Text("Hit Points")
                        .font(.headline)
                    
                    // HP Display
                    HStack(spacing: 20) {
                        VStack {
                            Text("Current")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("\(character.hitPointsCurrent)")
                                .font(.system(size: 40, weight: .bold))
                                .foregroundColor(hpColor)
                        }
                        
                        Text("/")
                            .font(.title)
                            .foregroundColor(.secondary)
                        
                        VStack {
                            Text("Maximum")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("\(character.hitPointsMax)")
                                .font(.system(size: 40, weight: .bold))
                        }
                    }
                    
                    // Temp HP
                    if character.hitPointsTemp > 0 {
                        HStack {
                            Image(systemName: "shield.fill")
                                .foregroundColor(.blue)
                            Text("Temp HP: \(character.hitPointsTemp)")
                                .font(.subheadline)
                        }
                    }
                    
                    // HP Progress Bar
                    ProgressView(value: Double(character.hitPointsCurrent), total: Double(character.hitPointsMax))
                        .tint(hpColor)
                        .scaleEffect(x: 1, y: 2, anchor: .center)
                    
                    // HP Adjustment Buttons
                    HStack(spacing: 15) {
                        // Damage
                        VStack {
                            TextField("Damage", text: $damageAmount)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .keyboardType(.numberPad)
                            Button("Take Damage") {
                                if let damage = Int(damageAmount) {
                                    let newHP = max(0, character.hitPointsCurrent - damage)
                                    Task {
                                        await viewModel.updateCharacter(id: character.id, updates: ["hit_points_current": newHP])
                                    }
                                    damageAmount = ""
                                }
                            }
                            .buttonStyle(.bordered)
                            .tint(.red)
                        }
                        
                        // Healing
                        VStack {
                            TextField("Heal", text: $healAmount)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .keyboardType(.numberPad)
                            Button("Heal") {
                                if let heal = Int(healAmount) {
                                    let newHP = min(character.hitPointsMax, character.hitPointsCurrent + heal)
                                    Task {
                                        await viewModel.updateCharacter(id: character.id, updates: ["hit_points_current": newHP])
                                    }
                                    healAmount = ""
                                }
                            }
                            .buttonStyle(.bordered)
                            .tint(.green)
                        }
                    }
                    
                    // Temp HP
                    VStack {
                        TextField("Temp HP", text: $tempHPAmount)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .keyboardType(.numberPad)
                        Button("Set Temp HP") {
                            if let tempHP = Int(tempHPAmount) {
                                Task {
                                    await viewModel.updateCharacter(id: character.id, updates: ["hit_points_temp": tempHP])
                                }
                                tempHPAmount = ""
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.top)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(15)
                
                // Death Saves
                if character.hitPointsCurrent == 0 {
                    VStack(spacing: 10) {
                        Text("Death Saving Throws")
                            .font(.headline)
                        
                        HStack(spacing: 30) {
                            VStack {
                                Text("Successes")
                                    .font(.caption)
                                HStack {
                                    ForEach(0..<3) { index in
                                        Image(systemName: index < character.deathSaveSuccesses ? "checkmark.circle.fill" : "circle")
                                            .foregroundColor(index < character.deathSaveSuccesses ? .green : .gray)
                                            .onTapGesture {
                                                toggleDeathSave(success: true, index: index)
                                            }
                                    }
                                }
                            }
                            
                            VStack {
                                Text("Failures")
                                    .font(.caption)
                                HStack {
                                    ForEach(0..<3) { index in
                                        Image(systemName: index < character.deathSaveFailures ? "xmark.circle.fill" : "circle")
                                            .foregroundColor(index < character.deathSaveFailures ? .red : .gray)
                                            .onTapGesture {
                                                toggleDeathSave(success: false, index: index)
                                            }
                                    }
                                }
                            }
                        }
                        
                        Button("Roll Death Save") {
                            let roll = DiceRoller.rollD20()
                            // Handle death save logic
                            if roll == 1 {
                                // Critical fail = 2 failures
                                let newFailures = min(3, character.deathSaveFailures + 2)
                                Task {
                                    await viewModel.updateCharacter(id: character.id, updates: ["death_save_failures": newFailures])
                                }
                            } else if roll == 20 {
                                // Critical success = regain 1 HP
                                Task {
                                    await viewModel.updateCharacter(id: character.id, updates: ["hit_points_current": 1, "death_save_successes": 0, "death_save_failures": 0])
                                }
                            } else if roll >= 10 {
                                let newSuccesses = min(3, character.deathSaveSuccesses + 1)
                                Task {
                                    await viewModel.updateCharacter(id: character.id, updates: ["death_save_successes": newSuccesses])
                                }
                            } else {
                                let newFailures = min(3, character.deathSaveFailures + 1)
                                Task {
                                    await viewModel.updateCharacter(id: character.id, updates: ["death_save_failures": newFailures])
                                }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(15)
                }
                
                // Conditions
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Conditions")
                            .font(.headline)
                        Spacer()
                        Button(action: { showingConditions = true }) {
                            Image(systemName: "plus.circle.fill")
                        }
                    }
                    
                    if character.conditions.isEmpty {
                        Text("No conditions")
                            .foregroundColor(.secondary)
                    } else {
                        FlowLayout(spacing: 8) {
                            ForEach(character.conditions, id: \.self) { condition in
                                HStack(spacing: 4) {
                                    Text(condition)
                                        .font(.caption)
                                    Button(action: {
                                        removeCondition(condition)
                                    }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.caption)
                                    }
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
                .background(Color(.systemGray6))
                .cornerRadius(15)
            }
            .padding()
        }
        .sheet(isPresented: $showingConditions) {
            ConditionsSheet(character: character, viewModel: viewModel, isPresented: $showingConditions)
        }
    }
    
    private var hpColor: Color {
        let percentage = Double(character.hitPointsCurrent) / Double(character.hitPointsMax)
        if percentage > 0.5 {
            return .green
        } else if percentage > 0.25 {
            return .orange
        } else {
            return .red
        }
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

struct ConditionsSheet: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    @Binding var isPresented: Bool
    
    var body: some View {
        NavigationView {
            List(D5eData.conditions, id: \.self) { condition in
                Button(action: {
                    addCondition(condition)
                }) {
                    HStack {
                        Text(condition)
                        Spacer()
                        if character.conditions.contains(condition) {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
            }
            .navigationTitle("Add Condition")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
        }
    }
    
    private func addCondition(_ condition: String) {
        var conditions = character.conditions
        if !conditions.contains(condition) {
            conditions.append(condition)
            Task {
                await viewModel.updateCharacter(id: character.id, updates: ["conditions": conditions])
            }
        }
    }
}

// Simple FlowLayout for wrapping
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(
            in: proposal.replacingUnspecifiedDimensions().width,
            subviews: subviews,
            spacing: spacing
        )
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(
            in: bounds.width,
            subviews: subviews,
            spacing: spacing
        )
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y), proposal: .unspecified)
        }
    }
    
    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []
        
        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var lineHeight: CGFloat = 0
            
            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                
                if x + size.width > maxWidth && x > 0 {
                    x = 0
                    y += lineHeight + spacing
                    lineHeight = 0
                }
                
                positions.append(CGPoint(x: x, y: y))
                lineHeight = max(lineHeight, size.height)
                x += size.width + spacing
            }
            
            self.size = CGSize(width: maxWidth, height: y + lineHeight)
        }
    }
}

// MARK: - Inventory Tab

struct InventoryTab: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var totalWeight: Double {
        character.inventory.compactMap { item in
            Double(item["weight"] ?? "0")
        }.reduce(0, +)
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Currency
                VStack(alignment: .leading, spacing: 10) {
                    Text("Currency")
                        .font(.headline)
                    
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        CurrencyRow(name: "Platinum", amount: character.platinumPieces, icon: "⚪️")
                        CurrencyRow(name: "Gold", amount: character.goldPieces, icon: "🟡")
                        CurrencyRow(name: "Electrum", amount: character.electrumPieces, icon: "🟢")
                        CurrencyRow(name: "Silver", amount: character.silverPieces, icon: "⚪️")
                        CurrencyRow(name: "Copper", amount: character.copperPieces, icon: "🟤")
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(15)
                
                // Inventory
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Inventory")
                            .font(.headline)
                        Spacer()
                        Text("Weight: \(String(format: "%.1f", totalWeight)) lbs")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    if character.inventory.isEmpty {
                        Text("No items")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(character.inventory.indices, id: \.self) { index in
                            if let item = character.inventory[index] as? [String: String] {
                                InventoryItemRow(item: item)
                            }
                        }
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(15)
            }
            .padding()
        }
    }
}

struct CurrencyRow: View {
    let name: String
    let amount: Int
    let icon: String
    
    var body: some View {
        HStack {
            Text(icon)
            Text(name)
                .font(.subheadline)
            Spacer()
            Text("\(amount)")
                .font(.subheadline)
                .bold()
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(8)
    }
}

struct InventoryItemRow: View {
    let item: [String: String]
    
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(item["name"] ?? "Unknown Item")
                    .font(.subheadline)
                if let description = item["description"] {
                    Text(description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            if let weight = item["weight"] {
                Text("\(weight) lbs")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(8)
    }
}

// MARK: - Spells Tab

struct SpellsTab: View {
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Spellcasting Info
                if let spellAbility = character.spellcastingAbility {
                    VStack(spacing: 10) {
                        Text("Spellcasting")
                            .font(.headline)
                        
                        HStack(spacing: 20) {
                            VStack {
                                Text("Spell Save DC")
                                    .font(.caption)
                                Text("\(character.spellSaveDc ?? 0)")
                                    .font(.title3)
                                    .bold()
                            }
                            
                            VStack {
                                Text("Spell Attack")
                                    .font(.caption)
                                Text("+\(character.spellAttackBonus ?? 0)")
                                    .font(.title3)
                                    .bold()
                            }
                            
                            VStack {
                                Text("Ability")
                                    .font(.caption)
                                Text(spellAbility.uppercased())
                                    .font(.title3)
                                    .bold()
                            }
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(15)
                }
                
                // Spell Slots
                if !character.spellSlots.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Spell Slots")
                            .font(.headline)
                        
                        ForEach(character.spellSlots.keys.sorted(), id: \.self) { level in
                            if let total = character.spellSlots[level],
                               let used = character.spellSlotsUsed[level] {
                                SpellSlotRow(level: level, used: used, total: total, character: character, viewModel: viewModel)
                            }
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(15)
                }
                
                // Known Spells
                VStack(alignment: .leading, spacing: 10) {
                    Text("Known Spells")
                        .font(.headline)
                    
                    if character.spellsKnown.isEmpty {
                        Text("No spells known")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(character.spellsKnown.indices, id: \.self) { index in
                            if let spell = character.spellsKnown[index] as? [String: String] {
                                SpellRow(spell: spell, isPrepared: character.spellsPrepared.contains(spell["name"] ?? ""))
                            }
                        }
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(15)
            }
            .padding()
        }
    }
}

struct SpellSlotRow: View {
    let level: String
    let used: Int
    let total: Int
    let character: Character
    @ObservedObject var viewModel: CharacterViewModel
    
    var body: some View {
        HStack {
            Text("Level \(level)")
                .font(.subheadline)
            
            Spacer()
            
            HStack(spacing: 4) {
                ForEach(0..<total, id: \.self) { index in
                    Circle()
                        .fill(index < used ? Color.gray : Color.blue)
                        .frame(width: 20, height: 20)
                        .onTapGesture {
                            toggleSpellSlot(level: level, index: index)
                        }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(8)
    }
    
    private func toggleSpellSlot(level: String, index: Int) {
        var slotsUsed = character.spellSlotsUsed
        let currentUsed = slotsUsed[level] ?? 0
        
        if index < currentUsed {
            slotsUsed[level] = currentUsed - 1
        } else {
            slotsUsed[level] = currentUsed + 1
        }
        
        Task {
            await viewModel.updateCharacter(id: character.id, updates: ["spell_slots_used": slotsUsed])
        }
    }
}

struct SpellRow: View {
    let spell: [String: String]
    let isPrepared: Bool
    
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                HStack {
                    Text(spell["name"] ?? "Unknown Spell")
                        .font(.subheadline)
                    if isPrepared {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.blue)
                            .font(.caption)
                    }
                }
                if let level = spell["level"] {
                    Text("Level \(level)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(8)
    }
}

// MARK: - Notes Tab

struct NotesTab: View {
    let character: Character
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let appearance = character.appearance, !appearance.isEmpty {
                    NoteSection(title: "Appearance", content: appearance)
                }
                
                if let personality = character.personalityTraits, !personality.isEmpty {
                    NoteSection(title: "Personality Traits", content: personality)
                }
                
                if let ideals = character.ideals, !ideals.isEmpty {
                    NoteSection(title: "Ideals", content: ideals)
                }
                
                if let bonds = character.bonds, !bonds.isEmpty {
                    NoteSection(title: "Bonds", content: bonds)
                }
                
                if let flaws = character.flaws, !flaws.isEmpty {
                    NoteSection(title: "Flaws", content: flaws)
                }
                
                if let backstory = character.backstory, !backstory.isEmpty {
                    NoteSection(title: "Backstory", content: backstory)
                }
            }
            .padding()
        }
    }
}

struct NoteSection: View {
    let title: String
    let content: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Text(content)
                .font(.body)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray6))
        .cornerRadius(15)
    }
}


