export function HangingSection({
                                   label,
                                   children,
                               }: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <section className="hang">
            <div className="rail">{label}</div>
            <div>{children}</div>
        </section>
    );
}