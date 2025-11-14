import SwiftUI

struct CharacterCreationView: View {
    @ObservedObject var viewModel: CharacterViewModel
    @Binding var isPresented: Bool
    @State private var currentStep = 0
    
    // Character data
    @State private var name = ""
    @State private var selectedRace = "Human"
    @State private var selectedClass = "Fighter"
    @State private var selectedBackground = "Folk Hero"
    @State private var selectedAlignment: Alignment = .trueNeutral
    
    // Ability scores
    @State private var strength = 10
    @State private var dexterity = 10
    @State private var constitution = 10
    @State private var intelligence = 10
    @State private var wisdom = 10
    @State private var charisma = 10
    
    // Skills
    @State private var selectedSkills: Set<String> = []
    
    // Other details
    @State private var appearance = ""
    @State private var backstory = ""
    @State private var personalityTraits = ""
    @State private var ideals = ""
    @State private var bonds = ""
    @State private var flaws = ""
    
    private let steps = ["Basic Info", "Ability Scores", "Skills", "Personality", "Review"]
    
    var body: some View {
        NavigationView {
            VStack {
                // Progress indicator
                HStack(spacing: 8) {
                    ForEach(0..<steps.count, id: \.self) { index in
                        Circle()
                            .fill(index <= currentStep ? Color.blue : Color.gray.opacity(0.3))
                            .frame(width: 10, height: 10)
                    }
                }
                .padding()
                
                // Step content
                TabView(selection: $currentStep) {
                    BasicInfoStep(
                        name: $name,
                        selectedRace: $selectedRace,
                        selectedClass: $selectedClass,
                        selectedBackground: $selectedBackground,
                        selectedAlignment: $selectedAlignment
                    )
                    .tag(0)
                    
                    AbilityScoresStep(
                        strength: $strength,
                        dexterity: $dexterity,
                        constitution: $constitution,
                        intelligence: $intelligence,
                        wisdom: $wisdom,
                        charisma: $charisma
                    )
                    .tag(1)
                    
                    SkillsStep(
                        selectedClass: selectedClass,
                        selectedSkills: $selectedSkills
                    )
                    .tag(2)
                    
                    PersonalityStep(
                        appearance: $appearance,
                        backstory: $backstory,
                        personalityTraits: $personalityTraits,
                        ideals: $ideals,
                        bonds: $bonds,
                        flaws: $flaws
                    )
                    .tag(3)
                    
                    ReviewStep(
                        name: name,
                        race: selectedRace,
                        characterClass: selectedClass,
                        background: selectedBackground,
                        alignment: selectedAlignment,
                        strength: strength,
                        dexterity: dexterity,
                        constitution: constitution,
                        intelligence: intelligence,
                        wisdom: wisdom,
                        charisma: charisma
                    )
                    .tag(4)
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
                
                // Navigation buttons
                HStack {
                    if currentStep > 0 {
                        Button("Previous") {
                            withAnimation {
                                currentStep -= 1
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                    
                    Spacer()
                    
                    if currentStep < steps.count - 1 {
                        Button("Next") {
                            withAnimation {
                                currentStep += 1
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!canProceed)
                    } else {
                        Button("Create Character") {
                            createCharacter()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(viewModel.isLoading)
                    }
                }
                .padding()
            }
            .navigationTitle(steps[currentStep])
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
        }
    }
    
    private var canProceed: Bool {
        switch currentStep {
        case 0:
            return !name.isEmpty
        default:
            return true
        }
    }
    
    private func createCharacter() {
        // Apply racial bonuses
        var finalStr = strength
        var finalDex = dexterity
        var finalCon = constitution
        var finalInt = intelligence
        var finalWis = wisdom
        var finalCha = charisma
        
        if let raceInfo = D5eData.raceDetails[selectedRace] {
            finalStr += raceInfo.abilityBonuses["strength"] ?? 0
            finalDex += raceInfo.abilityBonuses["dexterity"] ?? 0
            finalCon += raceInfo.abilityBonuses["constitution"] ?? 0
            finalInt += raceInfo.abilityBonuses["intelligence"] ?? 0
            finalWis += raceInfo.abilityBonuses["wisdom"] ?? 0
            finalCha += raceInfo.abilityBonuses["charisma"] ?? 0
        }
        
        // Calculate HP (max at level 1)
        let classInfo = D5eData.classDetails[selectedClass]
        let hitDie = classInfo?.hitDie ?? 8
        let conModifier = DiceRoller.calculateModifier(finalCon)
        let maxHP = hitDie + conModifier
        
        // Calculate AC (basic 10 + dex modifier, should be enhanced based on equipment)
        let dexModifier = DiceRoller.calculateModifier(finalDex)
        let baseAC = 10 + dexModifier
        
        // Get saving throw proficiencies
        let savingThrows = classInfo?.savingThrows ?? []
        
        let character = CharacterCreate(
            name: name,
            race: selectedRace,
            characterClass: selectedClass,
            level: 1,
            background: selectedBackground,
            alignment: selectedAlignment,
            experiencePoints: 0,
            strength: finalStr,
            dexterity: finalDex,
            constitution: finalCon,
            intelligence: finalInt,
            wisdom: finalWis,
            charisma: finalCha,
            hitPointsMax: maxHP,
            hitPointsCurrent: maxHP,
            hitPointsTemp: 0,
            armorClass: baseAC,
            initiative: dexModifier,
            speed: D5eData.raceDetails[selectedRace]?.speed ?? 30,
            savingThrowProficiencies: savingThrows,
            skillProficiencies: Array(selectedSkills),
            personalityTraits: personalityTraits.isEmpty ? nil : personalityTraits,
            ideals: ideals.isEmpty ? nil : ideals,
            bonds: bonds.isEmpty ? nil : bonds,
            flaws: flaws.isEmpty ? nil : flaws,
            appearance: appearance.isEmpty ? nil : appearance,
            backstory: backstory.isEmpty ? nil : backstory
        )
        
        Task {
            let success = await viewModel.createCharacter(character)
            if success {
                isPresented = false
            }
        }
    }
}

// MARK: - Step Views

struct BasicInfoStep: View {
    @Binding var name: String
    @Binding var selectedRace: String
    @Binding var selectedClass: String
    @Binding var selectedBackground: String
    @Binding var selectedAlignment: Alignment
    
    var body: some View {
        Form {
            Section(header: Text("Name")) {
                TextField("Character Name", text: $name)
            }
            
            Section(header: Text("Race")) {
                Picker("Race", selection: $selectedRace) {
                    ForEach(D5eData.races, id: \.self) { race in
                        Text(race).tag(race)
                    }
                }
                
                if let raceInfo = D5eData.raceDetails[selectedRace] {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Speed: \(raceInfo.speed) ft")
                            .font(.caption)
                        if !raceInfo.traits.isEmpty {
                            Text("Traits: \(raceInfo.traits.joined(separator: ", "))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            
            Section(header: Text("Class")) {
                Picker("Class", selection: $selectedClass) {
                    ForEach(D5eData.classes, id: \.self) { className in
                        Text(className).tag(className)
                    }
                }
                
                if let classInfo = D5eData.classDetails[selectedClass] {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Hit Die: d\(classInfo.hitDie)")
                            .font(.caption)
                        Text("Primary Ability: \(classInfo.primaryAbility.capitalized)")
                            .font(.caption)
                    }
                }
            }
            
            Section(header: Text("Background")) {
                Picker("Background", selection: $selectedBackground) {
                    ForEach(D5eData.backgrounds, id: \.self) { background in
                        Text(background).tag(background)
                    }
                }
            }
            
            Section(header: Text("Alignment")) {
                Picker("Alignment", selection: $selectedAlignment) {
                    ForEach(Alignment.allCases, id: \.self) { alignment in
                        Text(alignment.displayName).tag(alignment)
                    }
                }
            }
        }
    }
}

struct AbilityScoresStep: View {
    @Binding var strength: Int
    @Binding var dexterity: Int
    @Binding var constitution: Int
    @Binding var intelligence: Int
    @Binding var wisdom: Int
    @Binding var charisma: Int
    
    var body: some View {
        Form {
            Section(header: Text("Ability Scores")) {
                HStack {
                    Text("Roll All")
                    Spacer()
                    Button("Roll 4d6 (drop lowest)") {
                        rollAllAbilities()
                    }
                    .buttonStyle(.bordered)
                }
            }
            
            AbilityScoreRow(name: "Strength", score: $strength)
            AbilityScoreRow(name: "Dexterity", score: $dexterity)
            AbilityScoreRow(name: "Constitution", score: $constitution)
            AbilityScoreRow(name: "Intelligence", score: $intelligence)
            AbilityScoreRow(name: "Wisdom", score: $wisdom)
            AbilityScoreRow(name: "Charisma", score: $charisma)
        }
    }
    
    private func rollAllAbilities() {
        strength = DiceRoller.rollAbilityScore()
        dexterity = DiceRoller.rollAbilityScore()
        constitution = DiceRoller.rollAbilityScore()
        intelligence = DiceRoller.rollAbilityScore()
        wisdom = DiceRoller.rollAbilityScore()
        charisma = DiceRoller.rollAbilityScore()
    }
}

struct AbilityScoreRow: View {
    let name: String
    @Binding var score: Int
    
    var body: some View {
        HStack {
            Text(name)
                .frame(width: 100, alignment: .leading)
            
            Stepper("\(score)", value: $score, in: 1...20)
            
            Text("(\(DiceRoller.calculateModifier(score) >= 0 ? "+" : "")\(DiceRoller.calculateModifier(score)))")
                .foregroundColor(.secondary)
                .frame(width: 50)
            
            Button(action: { score = DiceRoller.rollAbilityScore() }) {
                Image(systemName: "die.face.6")
            }
        }
    }
}

struct SkillsStep: View {
    let selectedClass: String
    @Binding var selectedSkills: Set<String>
    
    private var availableSkills: [String] {
        D5eData.classDetails[selectedClass]?.availableSkills ?? []
    }
    
    private var maxSkills: Int {
        D5eData.classDetails[selectedClass]?.skillChoices ?? 2
    }
    
    var body: some View {
        Form {
            Section(header: Text("Choose \(maxSkills) skills"), footer: Text("\(selectedSkills.count)/\(maxSkills) selected")) {
                ForEach(availableSkills, id: \.self) { skill in
                    Button(action: {
                        toggleSkill(skill)
                    }) {
                        HStack {
                            Text(skill)
                                .foregroundColor(.primary)
                            Spacer()
                            if selectedSkills.contains(skill) {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    .disabled(!selectedSkills.contains(skill) && selectedSkills.count >= maxSkills)
                }
            }
        }
    }
    
    private func toggleSkill(_ skill: String) {
        if selectedSkills.contains(skill) {
            selectedSkills.remove(skill)
        } else if selectedSkills.count < maxSkills {
            selectedSkills.insert(skill)
        }
    }
}

struct PersonalityStep: View {
    @Binding var appearance: String
    @Binding var backstory: String
    @Binding var personalityTraits: String
    @Binding var ideals: String
    @Binding var bonds: String
    @Binding var flaws: String
    
    var body: some View {
        Form {
            Section(header: Text("Appearance")) {
                TextEditor(text: $appearance)
                    .frame(height: 60)
            }
            
            Section(header: Text("Personality Traits")) {
                TextEditor(text: $personalityTraits)
                    .frame(height: 60)
            }
            
            Section(header: Text("Ideals")) {
                TextEditor(text: $ideals)
                    .frame(height: 60)
            }
            
            Section(header: Text("Bonds")) {
                TextEditor(text: $bonds)
                    .frame(height: 60)
            }
            
            Section(header: Text("Flaws")) {
                TextEditor(text: $flaws)
                    .frame(height: 60)
            }
            
            Section(header: Text("Backstory")) {
                TextEditor(text: $backstory)
                    .frame(height: 100)
            }
        }
    }
}

struct ReviewStep: View {
    let name: String
    let race: String
    let characterClass: String
    let background: String
    let alignment: Alignment
    let strength: Int
    let dexterity: Int
    let constitution: Int
    let intelligence: Int
    let wisdom: Int
    let charisma: Int
    
    var body: some View {
        Form {
            Section(header: Text("Character")) {
                LabeledContent("Name", value: name)
                LabeledContent("Race", value: race)
                LabeledContent("Class", value: characterClass)
                LabeledContent("Background", value: background)
                LabeledContent("Alignment", value: alignment.displayName)
            }
            
            Section(header: Text("Ability Scores")) {
                LabeledContent("Strength", value: "\(strength) (\(modifier(strength)))")
                LabeledContent("Dexterity", value: "\(dexterity) (\(modifier(dexterity)))")
                LabeledContent("Constitution", value: "\(constitution) (\(modifier(constitution)))")
                LabeledContent("Intelligence", value: "\(intelligence) (\(modifier(intelligence)))")
                LabeledContent("Wisdom", value: "\(wisdom) (\(modifier(wisdom)))")
                LabeledContent("Charisma", value: "\(charisma) (\(modifier(charisma)))")
            }
        }
    }
    
    private func modifier(_ score: Int) -> String {
        let mod = DiceRoller.calculateModifier(score)
        return mod >= 0 ? "+\(mod)" : "\(mod)"
    }
}


