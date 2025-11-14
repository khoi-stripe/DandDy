import SwiftUI

struct CharacterListView: View {
    @StateObject private var viewModel = CharacterViewModel()
    @State private var showingCreateSheet = false
    
    var body: some View {
        NavigationView {
            ZStack {
                if viewModel.characters.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "person.3")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        
                        Text("No Characters Yet")
                            .font(.title2)
                            .foregroundColor(.gray)
                        
                        Text("Create your first character to begin your adventure!")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                } else {
                    List {
                        ForEach(viewModel.characters) { character in
                            NavigationLink(destination: CharacterSheetView(character: character)) {
                                CharacterRowView(character: character)
                            }
                        }
                        .onDelete(perform: deleteCharacters)
                    }
                    .listStyle(InsetGroupedListStyle())
                }
            }
            .navigationTitle("Characters")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingCreateSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingCreateSheet) {
                CharacterCreationView(viewModel: viewModel, isPresented: $showingCreateSheet)
            }
            .task {
                await viewModel.loadCharacters()
            }
            .refreshable {
                await viewModel.loadCharacters()
            }
        }
    }
    
    private func deleteCharacters(at offsets: IndexSet) {
        for index in offsets {
            let character = viewModel.characters[index]
            Task {
                await viewModel.deleteCharacter(id: character.id)
            }
        }
    }
}

struct CharacterRowView: View {
    let character: Character
    
    var body: some View {
        HStack {
            // Class icon
            Image(systemName: classIcon(character.characterClass))
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 40)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(character.name)
                    .font(.headline)
                
                Text("\(character.race) \(character.characterClass) - Level \(character.level)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // HP display
            VStack(alignment: .trailing, spacing: 2) {
                Text("HP")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("\(character.hitPointsCurrent)/\(character.hitPointsMax)")
                    .font(.subheadline)
                    .foregroundColor(hpColor(character.hitPointsCurrent, character.hitPointsMax))
            }
        }
        .padding(.vertical, 4)
    }
    
    private func classIcon(_ className: String) -> String {
        switch className.lowercased() {
        case "barbarian": return "figure.wrestling"
        case "bard": return "music.note"
        case "cleric": return "cross.circle"
        case "druid": return "leaf.circle"
        case "fighter": return "shield.fill"
        case "monk": return "figure.martial.arts"
        case "paladin": return "shield.lefthalf.filled"
        case "ranger": return "arrow.up.right"
        case "rogue": return "theatermasks"
        case "sorcerer": return "sparkles"
        case "warlock": return "flame"
        case "wizard": return "book.circle"
        default: return "person.fill"
        }
    }
    
    private func hpColor(_ current: Int, _ max: Int) -> Color {
        let percentage = Double(current) / Double(max)
        if percentage > 0.5 {
            return .green
        } else if percentage > 0.25 {
            return .orange
        } else {
            return .red
        }
    }
}


